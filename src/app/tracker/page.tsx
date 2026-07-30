import Link from "next/link";
import { getDb, timeAgo } from "@/lib/db";
import { updateAppStatus } from "@/lib/actions";
import { avatarColor } from "@/components/MatchCard";

export const dynamic = "force-dynamic";

const STAGES: { key: string; label: string; statuses: string[]; next: Record<string, string> }[] = [
  { key: "applied", label: "Applied", statuses: ["submitted", "in_flight", "needs_you"], next: { interviewing: "→ Interviewing", ghosted: "→ Ghosted", rejected: "→ Rejected" } },
  { key: "ghosted", label: "Ghosted", statuses: ["ghosted"], next: { interviewing: "→ Interviewing", rejected: "→ Rejected" } },
  { key: "interviewing", label: "Interviewing", statuses: ["interviewing"], next: { offer: "→ Offer", rejected: "→ Rejected" } },
  { key: "rejected", label: "Rejected", statuses: ["rejected", "failed"], next: {} },
  { key: "offer", label: "Offer", statuses: ["offer"], next: {} },
];

type Row = {
  id: number; status: string; applied_at: string | null; updated_at: string;
  title: string; company: string; emails: number; days_since: number | null;
};

export default async function TrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company } = await searchParams;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, a.status, a.applied_at, a.updated_at, j.title, j.company,
              (SELECT COUNT(*) FROM inbox_messages m WHERE m.application_id = a.id) AS emails,
              CAST(julianday('now') - julianday(a.applied_at) AS INTEGER) AS days_since
       FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.status IN ('submitted','in_flight','ghosted','interviewing','needs_you','rejected','failed','offer')
       ${company ? "AND j.company LIKE ?" : ""}
       ORDER BY a.updated_at DESC`
    )
    .all(...(company ? [`%${company}%`] : [])) as Row[];

  const byStage = STAGES.map((s) => ({ ...s, apps: rows.filter((r) => s.statuses.includes(r.status)) }));
  const applied = rows.length;
  const interviewing = byStage.find((s) => s.key === "interviewing")!.apps.length + byStage.find((s) => s.key === "offer")!.apps.length;
  const rejected = byStage.find((s) => s.key === "rejected")!.apps.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold">🛫 Flights</h1>
        <form method="GET" className="flex-1 max-w-sm">
          <input name="company" defaultValue={company ?? ""} className="input !py-2" placeholder="🔍 Search companies" />
        </form>
        <div className="ml-auto flex gap-2">
          <a href="/api/export" className="btn">Export CSV</a>
          <Link href="/browse#add" className="btn btn-dark">Add application</Link>
        </div>
      </div>

      {/* Funnel */}
      {applied > 0 && (
        <div className="panel p-6 !rounded-2xl">
          <svg viewBox="0 0 1000 220" className="w-full h-44">
            <text x="8" y="115" fontSize="13" fill="var(--muted)">Applied ({applied})</text>
            <rect x="115" y="20" width="10" height="185" rx="3" fill="#9db3c8" />
            {interviewing > 0 && (
              <>
                <path d={`M 125 22 L 870 40 L 870 ${40 + Math.max(18, (interviewing / applied) * 160)} L 125 ${20 + (interviewing / applied) * 185 + 20} Z`} fill="#dbe7f0" opacity="0.85" />
                <rect x="870" y="40" width="10" height={Math.max(18, (interviewing / applied) * 160)} rx="3" fill="#7fa3c0" />
                <text x="888" y={52} fontSize="12" fill="var(--muted)">Interviewing ({interviewing})</text>
              </>
            )}
            {rejected > 0 && (
              <>
                <path d={`M 125 ${205 - (rejected / applied) * 160} L 870 ${200 - Math.max(18, (rejected / applied) * 140)} L 870 200 L 125 205 Z`} fill="#f3dcdc" opacity="0.9" />
                <rect x="870" y={200 - Math.max(18, (rejected / applied) * 140)} width="10" height={Math.max(18, (rejected / applied) * 140)} rx="3" fill="#cf8d8d" />
                <text x="888" y={198} fontSize="12" fill="var(--muted)">Rejected ({rejected})</text>
              </>
            )}
          </svg>
        </div>
      )}

      {/* Stage columns */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {byStage.map((stage) => (
          <div key={stage.key}>
            <div className="flex items-baseline justify-between border-b-2 pb-1.5 mb-3"
              style={{ borderColor: stage.key === "offer" ? "var(--amber)" : stage.key === "rejected" ? "var(--red)" : "var(--border)" }}>
              <span className="section-label">{stage.label}</span>
              <span className="hint">{stage.apps.length}</span>
            </div>
            <div className="space-y-2">
              {stage.apps.length === 0 && <div className="hint">No applications</div>}
              {stage.apps.map((app) => (
                <div key={app.id} className="panel p-3 !rounded-xl">
                  <Link href={`/applications/${app.id}`} className="flex items-center gap-2.5 group">
                    <span className="avatar !w-8 !h-8 !text-[0.7rem]" style={{ background: avatarColor(app.company) }}>
                      {app.company.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="font-bold text-sm block truncate group-hover:underline">{app.company}</span>
                      <span className="hint block truncate">
                        {app.applied_at ? new Date(app.applied_at + "Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : timeAgo(app.updated_at)}
                        {app.emails > 0 && <> · ✉ {app.emails} email{app.emails > 1 ? "s" : ""}</>}
                      </span>
                    </span>
                  </Link>
                  {stage.key === "applied" && app.emails === 0 && (app.days_since ?? 0) >= 7 && (
                    <div className="mt-2 text-[0.68rem] font-semibold text-[var(--amber)]">
                      🔔 {app.days_since} days, no reply — worth a follow-up
                    </div>
                  )}
                  {Object.keys(stage.next).length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {Object.entries(stage.next).map(([status, label]) => (
                        <form key={status} action={updateAppStatus}>
                          <input type="hidden" name="app_id" value={app.id} />
                          <input type="hidden" name="status" value={status} />
                          <button className="btn btn-sm btn-ghost !text-[0.68rem] !px-2">{label}</button>
                        </form>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
