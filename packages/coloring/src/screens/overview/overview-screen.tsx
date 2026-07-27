"use client";

import { useRouter } from "next/navigation";
import { Icon, type IconName } from "../../lib/icon";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Badge, type BadgeTone } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { LoadingRows } from "../../components/ui/states";
import { COLORING_BASE as B } from "../../components/shell/nav-config";
import { useCloneJobs } from "../../data/use-clone-jobs";
import { useJobCounts } from "../../data/use-job-counts";
import { useBooks } from "../../data/use-books";
import { metaFor, BUCKETS, countFor } from "../../data/status";
import { resolveImg } from "../../data/img";
import { CHART_AREA, CHART_LINE, CHART_XLABELS } from "./data";

const capLabel = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--muted-foreground)",
  textTransform: "uppercase" as const,
  letterSpacing: "var(--tracking-caps)",
};
const statNum = { fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, letterSpacing: "-0.02em", marginTop: 6 };
const th = { textAlign: "left" as const, padding: "10px 12px", ...capLabel, borderBottom: "1px solid var(--border)" };
const td = { padding: 12, borderBottom: "1px solid var(--border)" };
const mono = { fontFamily: "var(--font-mono)" };

function Kpi({ label, value, icon, badge }: { label: string; value: string; icon: IconName; badge?: { tone: BadgeTone; dot?: boolean; text: string } }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={capLabel}>{label}</div>
          <div style={statNum}>{value}</div>
          {badge && <div style={{ marginTop: 8 }}><Badge tone={badge.tone} dot={badge.dot}>{badge.text}</Badge></div>}
        </div>
        <span style={{ width: 38, height: 38, borderRadius: "var(--radius-md)", background: "var(--carbon-950)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={19} color="#fff" />
        </span>
      </div>
    </Card>
  );
}

export function OverviewScreen() {
  const router = useRouter();
  const go = (path: string) => () => router.push(path);
  const { jobs, isLoading: jobsLoading } = useCloneJobs("all", 6);
  const counts = useJobCounts();
  const jobTotal = counts.all ?? 0;
  const { books, total: bookTotal, isLoading: booksLoading } = useBooks(1, 6);

  const recent = jobs.slice(0, 6);
  const queueBase = Math.max(jobTotal, 1);
  const runningCount = countFor(BUCKETS.find((b) => b.key === "running")!, counts);
  const queueCount = countFor(BUCKETS.find((b) => b.key === "pending")!, counts);
  const moreBooks = Math.max(0, bookTotal - 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.02em" }}>Tổng quan</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>colorpress studio · dữ liệu trực tiếp</p>
        </div>
        <Button onClick={go(`${B}/jobs/new`)}><Icon name="plus" size={18} /> Tạo clone job</Button>
      </div>

      {/* KPI grid — first two live, last two static (no endpoint yet) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
        <Kpi label="Job đang chạy" value={jobsLoading ? "…" : String(runningCount)} icon="copy" badge={{ tone: "info", text: `${queueCount} trong queue` }} />
        <Kpi label="Sách trong thư viện" value={booksLoading ? "…" : String(bookTotal)} icon="book-open" badge={{ tone: "success", dot: true, text: "Cập nhật realtime" }} />
        <Kpi label="Chi phí AI tháng 7" value="$214.60" icon="wallet" badge={{ tone: "warning", text: "+18% so tháng 6" }} />
        <Kpi label="Đang bán trên Etsy" value="42" icon="store" badge={{ tone: "success", dot: true, text: "31 đơn tháng này" }} />
      </div>

      {/* chart (static) + live queue */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <Card title="Job hoàn thành · 14 ngày">
          <svg viewBox="0 0 560 140" style={{ width: "100%", height: "auto", display: "block" }}>
            <polygon points={CHART_AREA} fill="var(--volt-200)" opacity={0.55} />
            <polyline points={CHART_LINE} fill="none" stroke="var(--volt-600)" strokeWidth={2.5} strokeLinejoin="round" />
            <circle cx={560} cy={36} r={4.5} fill="var(--carbon-950)" stroke="var(--volt-500)" strokeWidth={2.5} />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--muted-foreground)", ...mono }}>
            {CHART_XLABELS.map((x) => <span key={x}>{x}</span>)}
          </div>
        </Card>

        <Card title="Hàng đợi hôm nay">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {BUCKETS.map((bk) => {
              const c = countFor(bk, counts);
              return (
                <div key={bk.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span>{bk.label}</span>
                    <span style={{ ...mono, fontWeight: 600 }}>{jobsLoading ? "…" : c}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--muted)" }}>
                    <div style={{ height: "100%", width: `${Math.round((c / queueBase) * 100)}%`, borderRadius: 99, background: bk.barColor }} />
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={go(`${B}/jobs`)} style={{ width: "100%" }}>Xem tất cả job</Button>
          </div>
        </Card>
      </div>

      {/* etsy + budget (static — no endpoint) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, alignItems: "start" }}>
        <Card title="Etsy hôm nay">
          <div style={{ display: "flex", flexDirection: "column", fontSize: 13.5 }}>
            {[["Doanh thu", "$86.40", true], ["Đơn mới", "7", true], ["Views", "612", true], ["Bán chạy nhất", "Magic Unicorn Land · 3 đơn", false]].map(([l, v, m], i) => (
              <div key={l as string} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < 3 ? "1px solid var(--border)" : undefined }}>
                <span style={{ color: "var(--muted-foreground)" }}>{l}</span>
                <span style={m ? { ...mono, fontWeight: 600 } : { fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={go(`${B}/etsy`)} style={{ width: "100%", marginTop: 14 }}>Mở Etsy listings</Button>
        </Card>

        <Card title="Ngân sách AI tháng 7">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Progress value={72} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}><span style={{ color: "var(--muted-foreground)" }}>Đã dùng</span><span style={{ ...mono, fontWeight: 600 }}>$214.60 / $300.00</span></div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Cảnh báo ở 80% · hàng đợi tạm dừng khi vượt ngân sách</div>
            <Button variant="outline" size="sm" onClick={go(`${B}/system`)} style={{ width: "100%" }}>Chi tiết chi phí &amp; logs</Button>
          </div>
        </Card>
      </div>

      {/* live recent jobs */}
      <Card title="Job gần đây">
        {jobsLoading ? (
          <LoadingRows rows={4} />
        ) : recent.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "8px 0" }}>Chưa có clone job nào.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 680 }}>
              <thead>
                <tr><th style={th}>Job</th><th style={th}>Nguồn</th><th style={th}>Bước</th><th style={th}>Trạng thái</th></tr>
              </thead>
              <tbody>
                {recent.map((j) => {
                  const meta = metaFor(j.status);
                  return (
                    <tr key={j.id} className="mo-row" style={{ cursor: "pointer" }} onClick={go(`${B}/jobs/${j.id}`)}>
                      <td style={{ ...td, fontWeight: 600 }}>{j.name || j.id.slice(0, 8)}</td>
                      <td style={td}>{j.brand || "—"}</td>
                      <td style={{ ...td, ...mono }}>{j.currentStep || `${j.analyzedPages}/${j.totalPages || "—"}`}</td>
                      <td style={td}><Badge tone={meta.tone} dot={meta.dot}>{meta.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* live new books */}
      <Card title="Sách mới nhất">
        {booksLoading ? (
          <LoadingRows rows={2} height={120} />
        ) : books.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", padding: "8px 0" }}>Thư viện chưa có sách.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
            {books.slice(0, 5).map((b) => {
              const cover = resolveImg(b.squareThumbnailUrl || b.thumbnailUrl || b.coverUrl);
              return (
                <div key={b.id} style={{ cursor: "pointer" }} onClick={go(`${B}/books/${b.id}`)}>
                  <div className="mo-bookthumb" style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: "var(--neutral-100)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--neutral-400)", overflow: "hidden" }}>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt={b.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <Icon name="image" size={22} />
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 6, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                </div>
              );
            })}
            {moreBooks > 0 && (
              <div style={{ cursor: "pointer" }} onClick={go(`${B}/books`)}>
                <div style={{ aspectRatio: "1 / 1", borderRadius: "var(--radius-sm)", background: "var(--neutral-50)", border: "1px dashed var(--neutral-300)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--muted-foreground)" }}>
                  +{moreBooks} sách
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
