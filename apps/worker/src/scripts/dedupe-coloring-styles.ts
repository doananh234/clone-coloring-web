/**
 * De-duplicate ColoringStyle rows by folding near-duplicate styles into a single
 * canonical style whose distinct palettes become color VARIANTS.
 *
 * Two phases, so the AI grouping can be reviewed before any DB write:
 *
 *   yarn dedupe:styles --propose [--out proposal.json]
 *       Read-only. Ask the LLM to cluster styles by NAME+DESCRIPTION (ignoring
 *       color differences — those are variants). Writes a proposal JSON + prints
 *       a summary. Edit the file by hand if you disagree.
 *
 *   yarn dedupe:styles --apply [--in proposal.json]          # DRY RUN
 *   yarn dedupe:styles --apply --commit [--in proposal.json] # persist
 *       For each cluster: pick a canonical row, fold the others' palettes in as
 *       variants (fingerprint-deduped), REMAP references (books'
 *       coverMeta.coloringStyleId → canonical id + coloringVariantId; brands'
 *       coloringStyleId), back up every touched row to a file, then delete the
 *       merged rows.
 *
 * Requires AZURE_OPENAI_* env (loaded from apps/worker/.env / .env.prod).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { db } from "../db";
import { textPrompt } from "@vx/server-core/ai/llm-provider";
import {
  buildColoringStyleVariant,
  paletteFingerprint,
  readVariants,
  type ColoringStyleVariant,
} from "@vx/clone-core/steps";

const args = process.argv.slice(2);
const PROPOSE = args.includes("--propose");
const APPLY = args.includes("--apply");
const REPAIR = args.includes("--repair");
const COMMIT = args.includes("--commit");
const argVal = (flag: string, dflt: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const PROPOSAL_PATH = argVal("--out", argVal("--in", "coloring-style-dedupe-proposal.json"));
const BACKUP_PATH = argVal("--backup", "coloring-style-dedupe-backup.json");

interface Cluster {
  canonicalName: string;
  ids: string[];
}

const log = (m: string) => console.log(`[dedupe-styles]${(APPLY || REPAIR) && !COMMIT ? " [dry-run]" : ""} ${m}`);

async function propose() {
  const styles = await db.coloringStyle.findMany({
    select: { id: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
  const list = styles.map((s) => ({
    id: s.id,
    name: s.name,
    description: (s.description || "").slice(0, 240),
  }));

  const system =
    "You are a taxonomy assistant for coloring-book art styles. Group records that describe the SAME visual coloring style. IGNORE differences in specific colors — different palettes are variants of one style, NOT different styles. Merge near-duplicate names/descriptions (e.g. 'Pastel Digital Flat Fill' and 'Soft Pastel Digital Fill'). Keep genuinely different techniques separate.";
  const user =
    `Here are ${list.length} coloring styles. Return ONLY JSON of the form ` +
    `{"clusters":[{"canonicalName":"<clearest shared name>","ids":["<id>", ...]}]}. ` +
    `Every id MUST appear in exactly one cluster. Singletons are allowed.\n\n` +
    JSON.stringify(list);

  log(`asking LLM to cluster ${list.length} styles…`);
  const content = await textPrompt(user, {
    systemPrompt: system,
    jsonMode: true,
    maxTokens: 6000,
    temperature: 0,
  });

  let clusters: Cluster[] = [];
  try {
    // Providers may wrap JSON in prose/code fences — extract the outermost object.
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    const json = start >= 0 && end > start ? content.slice(start, end + 1) : content;
    const parsed = JSON.parse(json) as { clusters?: Cluster[] };
    clusters = Array.isArray(parsed.clusters) ? parsed.clusters : [];
  } catch {
    console.error("LLM did not return valid JSON:\n", content);
    process.exit(1);
  }

  // Coverage check — any id the LLM dropped becomes its own singleton.
  const seen = new Set<string>();
  for (const c of clusters) for (const id of c.ids || []) seen.add(id);
  const nameById = new Map(styles.map((s) => [s.id, s.name]));
  for (const s of styles) {
    if (!seen.has(s.id)) clusters.push({ canonicalName: s.name, ids: [s.id] });
  }
  // Drop ids the LLM hallucinated (not in the DB).
  clusters = clusters
    .map((c) => ({ ...c, ids: (c.ids || []).filter((id) => nameById.has(id)) }))
    .filter((c) => c.ids.length > 0);

  const merges = clusters.filter((c) => c.ids.length > 1);
  writeFileSync(PROPOSAL_PATH, JSON.stringify({ clusters }, null, 2));
  log(`wrote ${PROPOSAL_PATH}: ${clusters.length} clusters, ${merges.length} with merges.`);
  for (const c of merges) {
    log(`  • "${c.canonicalName}" ⇐ ${c.ids.map((id) => `"${nameById.get(id)}"`).join(", ")}`);
  }
  log(`total styles ${styles.length} → after merge ${clusters.length}.`);
}

/** Variants of a row, seeding from its own palette when the column is empty. */
function seedVariants(row: {
  variants: unknown;
  colorPalette: unknown;
  thumbnailUrl: string | null;
  colorizationDirective: string | null;
  sourceBookId: string | null;
}): ColoringStyleVariant[] {
  const vs = readVariants(row.variants);
  if (vs.length > 0) return vs;
  return [
    buildColoringStyleVariant(
      { colorPalette: row.colorPalette as never, colorizationDirective: row.colorizationDirective ?? "" },
      { id: crypto.randomUUID(), referenceUrl: row.thumbnailUrl ?? "", sourceBookId: row.sourceBookId, now: new Date().toISOString() },
    ),
  ];
}

async function apply() {
  const { clusters } = JSON.parse(readFileSync(PROPOSAL_PATH, "utf8")) as { clusters: Cluster[] };
  const rows = await db.coloringStyle.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));

  const backup: { styles: unknown[]; books: unknown[]; brands: unknown[] } = { styles: [], books: [], brands: [] };
  let mergedStyles = 0;
  let deletedStyles = 0;
  let remappedBooks = 0;
  let remappedBrands = 0;

  for (const cluster of clusters) {
    const ids = cluster.ids.filter((id) => byId.has(id));
    if (ids.length <= 1) continue;

    const clusterRows = ids.map((id) => byId.get(id)!);
    const canonical =
      clusterRows.find((r) => r.name.trim().toLowerCase() === cluster.canonicalName.trim().toLowerCase()) ||
      [...clusterRows].sort((a, b) => +a.createdAt - +b.createdAt)[0];
    const others = clusterRows.filter((r) => r.id !== canonical.id);

    // Fold palettes into one variant array; remember which variant represents
    // each old row's own palette (that's what its books referenced).
    const merged = seedVariants(canonical);
    const styleIdToVariantId = new Map<string, string>([[canonical.id, merged[0].id]]);
    for (const other of others) {
      const otherVariants = seedVariants(other);
      let primaryVariantId = "";
      otherVariants.forEach((v, i) => {
        const fp = paletteFingerprint(v.colorPalette);
        const hit = merged.find((m) => paletteFingerprint(m.colorPalette) === fp);
        const usedId = hit ? hit.id : (merged.push(v), v.id);
        if (i === 0) primaryVariantId = usedId;
      });
      styleIdToVariantId.set(other.id, primaryVariantId || merged[0].id);
    }

    backup.styles.push(...clusterRows);
    log(`"${cluster.canonicalName}": keep ${canonical.id}, merge ${others.length}, ${merged.length} variants total.`);

    // Collect ALL remaps from the ORIGINAL state first, THEN write. A book
    // references exactly one old id, so snapshotting before any write avoids the
    // trap where remapping a merged style's books to canonical.id makes them
    // re-match when we process canonical.id and clobbers their variant id.
    const bookRemaps: { id: string; data: Record<string, unknown> }[] = [];
    const brandRemaps: { id: string; data: Record<string, unknown> }[] = [];
    for (const oldId of ids) {
      const variantId = styleIdToVariantId.get(oldId)!;
      const books = await db.book.findMany({
        where: { data: { path: ["coverMeta", "coloringStyleId"], equals: oldId } },
        select: { id: true, data: true },
      });
      for (const b of books) {
        const data = (b.data && typeof b.data === "object" ? { ...(b.data as Record<string, unknown>) } : {}) as Record<string, unknown>;
        const coverMeta = { ...((data.coverMeta as Record<string, unknown>) ?? {}) };
        backup.books.push({ id: b.id, coverMeta: data.coverMeta });
        coverMeta.coloringStyleId = canonical.id;
        coverMeta.coloringVariantId = variantId;
        data.coverMeta = coverMeta;
        bookRemaps.push({ id: b.id, data });
        remappedBooks++;
      }

      const brands = await db.brand.findMany({
        where: { data: { path: ["coloringStyleId"], equals: oldId } },
        select: { id: true, data: true },
      });
      for (const br of brands) {
        const data = (br.data && typeof br.data === "object" ? { ...(br.data as Record<string, unknown>) } : {}) as Record<string, unknown>;
        backup.brands.push({ id: br.id, coloringStyleId: data.coloringStyleId });
        data.coloringStyleId = canonical.id;
        brandRemaps.push({ id: br.id, data });
        remappedBrands++;
      }
    }

    if (COMMIT) {
      for (const u of bookRemaps) await db.book.update({ where: { id: u.id }, data: { data: u.data as never } });
      for (const u of brandRemaps) await db.brand.update({ where: { id: u.id }, data: { data: u.data as never } });
      await db.coloringStyle.update({
        where: { id: canonical.id },
        data: { name: cluster.canonicalName, variants: merged as never },
      });
      await db.coloringStyle.deleteMany({ where: { id: { in: others.map((o) => o.id) } } });
    }
    mergedStyles++;
    deletedStyles += others.length;
  }

  writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
  log(`backup written to ${BACKUP_PATH}.`);
  log(
    `done. mergedClusters=${mergedStyles} deletedStyles=${deletedStyles} ` +
      `remappedBooks=${remappedBooks} remappedBrands=${remappedBrands}`,
  );
  if (!COMMIT) log("DRY RUN — nothing written. Re-run with --commit to persist.");
}

/** Pick the canonical row of a cluster the same way apply() does. */
function pickCanonical<T extends { id: string; name: string; createdAt: Date | string }>(
  rows: T[],
  canonicalName: string,
): T {
  return (
    rows.find((r) => r.name.trim().toLowerCase() === canonicalName.trim().toLowerCase()) ||
    [...rows].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0]
  );
}

/**
 * Recompute every remapped book's coverMeta.{coloringStyleId,coloringVariantId}
 * deterministically from the backup, fixing variant ids clobbered by the earlier
 * order-dependent apply. Idempotent — safe to re-run.
 */
async function repair() {
  const { clusters } = JSON.parse(readFileSync(PROPOSAL_PATH, "utf8")) as { clusters: Cluster[] };
  const backup = JSON.parse(readFileSync(BACKUP_PATH, "utf8")) as {
    styles: { id: string; name: string; createdAt: string; variants: unknown; colorPalette: unknown; thumbnailUrl: string | null; colorizationDirective: string | null; sourceBookId: string | null }[];
    books: { id: string; coverMeta: unknown }[];
  };

  const styleById = new Map(backup.styles.map((s) => [s.id, s]));
  // origStyleId → { canonicalId, primary palette fingerprint }
  const origInfo = new Map<string, { canonicalId: string; fp: string }>();
  for (const cluster of clusters) {
    const rows = cluster.ids.map((id) => styleById.get(id)).filter(Boolean) as (typeof backup.styles);
    if (rows.length <= 1) continue;
    const canonical = pickCanonical(rows, cluster.canonicalName);
    for (const row of rows) {
      origInfo.set(row.id, { canonicalId: canonical.id, fp: paletteFingerprint(seedVariants(row)[0].colorPalette) });
    }
  }

  // Current canonical variants → fingerprint→variantId per canonical style.
  const canonicalIds = [...new Set([...origInfo.values()].map((v) => v.canonicalId))];
  const currentCanon = await db.coloringStyle.findMany({ where: { id: { in: canonicalIds } }, select: { id: true, variants: true } });
  const fpMapByCanon = new Map<string, Map<string, string>>();
  for (const c of currentCanon) {
    const m = new Map<string, string>();
    for (const v of readVariants(c.variants)) m.set(paletteFingerprint(v.colorPalette), v.id);
    fpMapByCanon.set(c.id, m);
  }

  // First backup entry per book id = its TRUE original coverMeta (pre-mutation).
  const origByBook = new Map<string, Record<string, unknown>>();
  for (const b of backup.books) {
    if (!origByBook.has(b.id)) {
      origByBook.set(b.id, (b.coverMeta && typeof b.coverMeta === "object" ? (b.coverMeta as Record<string, unknown>) : {}));
    }
  }

  let fixed = 0;
  let unchanged = 0;
  for (const [bookId, origCoverMeta] of origByBook) {
    const origStyleId = typeof origCoverMeta.coloringStyleId === "string" ? origCoverMeta.coloringStyleId : "";
    const info = origInfo.get(origStyleId);
    if (!info) { unchanged++; continue; }
    const variantId = fpMapByCanon.get(info.canonicalId)?.get(info.fp) ?? null;

    const book = await db.book.findUnique({ where: { id: bookId }, select: { data: true } });
    if (!book) { unchanged++; continue; }
    const data = (book.data && typeof book.data === "object" ? { ...(book.data as Record<string, unknown>) } : {}) as Record<string, unknown>;
    const coverMeta = { ...((data.coverMeta as Record<string, unknown>) ?? {}) };
    if (coverMeta.coloringStyleId === info.canonicalId && coverMeta.coloringVariantId === variantId) { unchanged++; continue; }
    coverMeta.coloringStyleId = info.canonicalId;
    coverMeta.coloringVariantId = variantId;
    data.coverMeta = coverMeta;
    fixed++;
    log(`repair ${bookId}: style=${info.canonicalId} variant=${variantId}`);
    if (COMMIT) await db.book.update({ where: { id: bookId }, data: { data: data as never } });
  }
  log(`repair done. fixed=${fixed} unchanged=${unchanged}`);
  if (!COMMIT) log("DRY RUN — nothing written. Re-run with --commit to persist.");
}

async function main() {
  if (PROPOSE) return propose();
  if (REPAIR) return repair();
  if (APPLY) return apply();
  console.error("Usage: --propose [--out file] | --apply [--commit] [--in file] | --repair [--commit]");
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
