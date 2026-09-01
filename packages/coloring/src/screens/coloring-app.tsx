import { ColoringShell } from "../components/shell/coloring-shell";
import { OverviewScreen } from "./overview/overview-screen";
import { JobsScreen } from "./jobs/jobs-screen";
import { JobDetailScreen } from "./jobs/job-detail-screen";
import { NewJobScreen } from "./jobs/new-job-screen";
import { BooksScreen } from "./books/books-screen";
import { MyQueueScreen } from "./queue/my-queue-screen";
import { BookDetailScreen } from "./books/book-detail-screen";
import { BookEditScreen } from "./books/book-edit-screen";
import { BookCreateScreen } from "./books/book-create-screen";
import { EntityCreateScreen } from "./hubs/entity-create-screen";
import { ColorizeScreen } from "./books/colorize-screen";
import { CoverEditorScreen } from "./books/cover-editor-screen";
import { StylesScreen } from "./hubs/styles-screen";
import { LibraryScreen } from "./hubs/library-screen";
import { SystemScreen } from "./hubs/system-screen";
import { CharactersScreen, LocationsScreen, BrandsScreen, CategoriesListScreen, BwStylesScreen, ColorStylesScreen } from "./hubs/entity-lists";
import { ExtractStyleScreen } from "./hubs/extract-style-screen";
import { AiCostScreen } from "./system/ai-cost-screen";
import { SettingsScreen } from "./system/settings-screen";
import { FontsScreen } from "./system/fonts-screen";
import { CoverTextOverlaysScreen } from "./system/cover-text-overlays-screen";
import { OperatorsScreen } from "./system/operators-screen";
import { EntityDetailScreen } from "./entity/entity-detail-screen";
import { EntityEditScreen } from "./entity/entity-edit-screen";
import { EtsyScreen } from "./etsy/etsy-screen";
import { ComingSoonScreen } from "./coming-soon-screen";
import { resolvePageTitle, resolveCrumbs } from "./page-map";

export interface ColoringAppProps {
  /** Catch-all route segments below /coloring (empty = overview). */
  slug?: string[];
}

function screenFor(slug: string[], title: string) {
  const [top, sub] = slug;
  if (slug.length === 0) return <OverviewScreen />;
  if (top === "jobs" && !sub) return <JobsScreen />;
  if (top === "jobs" && sub === "new") return <NewJobScreen />;
  if (top === "jobs" && sub) return <JobDetailScreen jobId={sub} />;
  if (top === "books" && sub === "new") return <BookCreateScreen />;
  if (top === "queue") return <MyQueueScreen />;
  if (top === "books" && !sub) return <BooksScreen />;
  if (top === "books" && sub && slug[2] === "edit") return <BookEditScreen bookId={sub} />;
  if (top === "books" && sub && slug[2] === "colorize") return <ColorizeScreen bookId={sub} />;
  if (top === "books" && sub && slug[2] === "cover") return <CoverEditorScreen bookId={sub} />;
  if (top === "books" && sub) return <BookDetailScreen bookId={sub} />;
  if (top === "library" && sub === "characters") return <CharactersScreen />;
  if (top === "library" && sub === "locations") return <LocationsScreen />;
  if (top === "library" && sub === "brands" && slug[2] === "new") return <EntityCreateScreen kind="brands" />;
  if (top === "library" && sub === "brands") return <BrandsScreen />;
  if (top === "library" && sub === "categories" && slug[2] === "new") return <EntityCreateScreen kind="categories" />;
  if (top === "library" && sub === "categories") return <CategoriesListScreen />;
  if (top === "library" && !sub) return <LibraryScreen />;
  if (top === "styles" && sub === "bwstyles") return <BwStylesScreen />;
  if (top === "styles" && sub === "colorstyles") return <ColorStylesScreen />;
  if (top === "styles" && sub === "extractbw") return <ExtractStyleScreen kind="art-styles" />;
  if (top === "styles" && sub === "extractcolor") return <ExtractStyleScreen kind="coloring-styles" />;
  if (top === "styles" && !sub) return <StylesScreen />;
  if (top === "system" && sub === "ai-cost") return <AiCostScreen />;
  if (top === "system" && sub === "settings") return <SettingsScreen />;
  if (top === "system" && !sub) return <SystemScreen />;
  if (top === "fonts") return <FontsScreen />;
  if (top === "cover-overlays") return <CoverTextOverlaysScreen />;
  if (top === "accounts") return <OperatorsScreen />;
  if (top === "entity" && slug[1] && slug[2] && slug[3] === "edit") return <EntityEditScreen kind={slug[1]} id={slug[2]} />;
  if (top === "entity" && slug[1] && slug[2]) return <EntityDetailScreen kind={slug[1]} id={slug[2]} />;
  if (top === "etsy" && !sub) return <EtsyScreen />;
  return <ComingSoonScreen title={title} />;
}

export function ColoringApp({ slug = [] }: ColoringAppProps) {
  const title = resolvePageTitle(slug);
  return (
    <ColoringShell pageTitle={title} crumbs={resolveCrumbs(slug)}>
      {screenFor(slug, title)}
    </ColoringShell>
  );
}
