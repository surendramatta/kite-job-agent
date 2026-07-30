import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, getProfile, getSetting, Job, STATUS_LABELS, timeAgo } from "@/lib/db";
import { computeMatch, getDefaultResumeContent, getPreferences, isExcluded, appliedTodayCount } from "@/lib/matching";
import { applyToAllMatches, refreshJobs, runAgentNow } from "@/lib/actions";
import MatchCard, { avatarColor } from "@/components/MatchCard";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "submitted", label: "Submitted", statuses: ["submitted", "interviewing", "offer"] },
  { key: "in_flight", label: "In flight", statuses: ["in_flight"] },
  { key: "needs_you", label: "Needs you", statuses: ["pending_approval", "needs_you", "preparing"] },
  { key: "failed", label: "Failed", statuses: ["failed", "rejected"] },
  { key: "skipped", label: "Skipped", statuses: ["skipped"] },
];

type SP = { q?: string; filter?: string; company?: string; workplace?: string; role?: string; location?: string; jobtype?: string; days?: string; exp?: string; salary?: string; source?: string; companyq?: string; sort?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (getSetting("onboarded") !== "1") redirect("/onboarding");
  const sp = await searchParams;
  const q = sp.q ?? "";
  const filter = FILTERS.find((f) => f.key === (sp.filter ?? "all")) ?? FILTERS[0];

  const db = getDb();
  const prefs = getPreferences();
  const resume = getDefaultResumeContent();

  const params: unknown[] = [];
  let where = "j.hidden = 0 AND a.id IS NULL";
  if (q) {
    where += " AND (j.title LIKE ? OR j.company LIKE ? OR j.tags_json LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (sp.workplace === "remote") where += " AND j.remote = 1";
  if (sp.workplace === "onsite") where += " AND j.remote = 0";
  if (sp.location) {
    where += " AND (j.location LIKE ? OR (j.remote = 1 AND ? LIKE '%remote%'))";
    params.push(`%${sp.location}%`, sp.location.toLowerCase());
  }
  if (sp.jobtype) {
    where += " AND (LOWER(j.job_type) LIKE ? OR LOWER(j.title) LIKE ?)";
    params.push(`%${sp.jobtype}%`, `%${sp.jobtype}%`);
  }
  if (sp.days) {
    where += " AND j.posted_at >= datetime('now', ?)";
    params.push(`-${parseInt(sp.days, 10) || 7} days`);
  }
  if (sp.exp) {
    where += " AND LOWER(j.title) LIKE ?";
    params.push(`%${sp.exp}%`);
  }
  if (sp.salary) {
    where += " AND j.salary != ''";
  }
  if (sp.source === "direct") {
    where += " AND (j.source LIKE 'greenhouse:%' OR j.source LIKE 'lever:%' OR j.source LIKE 'ashby:%' OR j.source LIKE 'smartrecruiters:%' OR j.source LIKE 'recruitee:%')";
  } else if (sp.source) {
    where += " AND j.source = ?";
    params.push(sp.source);
  }
  if (sp.companyq) {
    where += " AND j.company LIKE ?";
    params.push(`%${sp.companyq}%`);
  }
  const candidates = db
    .prepare(
      `SELECT j.* FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE ${where} ORDER BY j.posted_at DESC NULLS LAST, j.fetched_at DESC LIMIT 120`
    )
    .all(...params) as Job[];

  const matches = candidates
    .filter((j) => !isExcluded(j, prefs))
    .map((job) => ({ job, match: computeMatch(job, resume, prefs) }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 5);

  const appWhere: string[] = [];
  const appParams: unknown[] = [];
  if (filter.statuses.length) {
    appWhere.push(`a.status IN (${filter.statuses.map(() => "?").join(",")})`);
    appParams.push(...filter.statuses);
  }
  if (sp.company) {
    appWhere.push("j.company LIKE ?");
    appParams.push(`%${sp.company}%`);
  }
  const apps = db
    .prepare(
      `SELECT a.id, a.status, a.applied_at, a.updated_at, a.tailored_resume_json, a.resume_id,
              j.title, j.company FROM applications a
       JOIN jobs j ON j.id = a.job_id ${appWhere.length ? "WHERE " + appWhere.join(" AND ") : ""}
       ORDER BY a.updated_at DESC LIMIT 100`
    )
    .all(...appParams) as {
    id: number; status: string; applied_at: string | null; updated_at: string;
    tailored_resume_json: string | null; resume_id: number | null; title: string; company: string;
  }[];

  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f.key,
      f.statuses.length
        ? (db.prepare(`SELECT COUNT(*) n FROM applications WHERE status IN (${f.statuses.map(() => "?").join(",")})`).get(...f.statuses) as { n: number }).n
        : (db.prepare("SELECT COUNT(*) n FROM applications").get() as { n: number }).n,
    ])
  );

  // Personal greeting + agent status strip
  const profile = getProfile();
  const firstName = (profile.full_name || "there").split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const weekApps = (
    db.prepare("SELECT COUNT(*) n FROM applications WHERE applied_at >= datetime('now','-7 days')").get() as { n: number }
  ).n;
  const replies = (
    db.prepare("SELECT COUNT(*) n FROM applications WHERE status IN ('interviewing','offer','needs_you')").get() as { n: number }
  ).n;
  const responseRate = weekApps > 0 ? Math.round((replies / Math.max(weekApps, replies)) * 100) : 0;
  const autopilot = getSetting("autopilot_enabled") === "1";
  const agentError = getSetting("agent_last_error");
  const inFlight = (
    db.prepare("SELECT COUNT(*) n FROM applications WHERE status = 'in_flight'").get() as { n: number }
  ).n;
  const lastRun = db
    .prepare("SELECT b.result, b.created_at, j.company FROM bot_runs b LEFT JOIN jobs j ON j.id = b.job_id ORDER BY b.created_at DESC LIMIT 1")
    .get() as { result: string; created_at: string; company: string | null } | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {greeting}, {firstName} 🪁
          </h1>
          <p className="hint mt-0.5">
            {weekApps} application{weekApps === 1 ? "" : "s"} this week · {appliedTodayCount()}/{prefs.dailyLimit} today
            {responseRate > 0 && <> · {responseRate}% getting responses</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`status ${autopilot ? "status-submitted" : "status-skipped"}`}>
            Autopilot {autopilot ? "ON" : "OFF"}
          </span>
          {inFlight > 0 && <span className="status status-in_flight">{inFlight} in flight</span>}
          {agentError && (
            <span className="status status-failed" title={agentError}>agent needs setup</span>
          )}
          {lastRun && !agentError && (
            <span className="hint">
              agent last ran {timeAgo(lastRun.created_at)}
              {lastRun.company ? ` (${lastRun.company})` : ""}
            </span>
          )}
          <form action={runAgentNow}>
            <button className="btn btn-pine btn-sm">▶ Run agent now</button>
          </form>
        </div>
      </div>
      {agentError && (
        <div className="panel p-3 !rounded-xl text-sm text-[var(--amber)]">
          ⚠ The apply agent can&apos;t run yet: {agentError}. In a terminal:{" "}
          <code className="bg-[var(--panel-2)] px-1.5 py-0.5 rounded">npx playwright install chromium</code>{" "}
          then restart the app.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "In the feed", value: candidates.length, icon: "🔭" },
          { label: "Applications", value: counts["all"] ?? 0, icon: "📨" },
          { label: "Submitted", value: counts["submitted"] ?? 0, icon: "✅" },
          { label: "Needs you", value: counts["needs_you"] ?? 0, icon: "✋" },
        ].map((s) => (
          <div key={s.label} className="panel p-4 !rounded-2xl">
            <div className="text-2xl font-extrabold">{s.icon} {s.value}</div>
            <div className="hint mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <FilterBar q={q} sp={sp as Record<string, string>} />

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold">Best matches right now</h2>
          <div className="flex gap-2">
            <Link href="/browse#add" className="btn">+ Add your own</Link>
            <Link href="/browse" className="btn">🗂 Browse jobs</Link>
            {matches.length > 0 && (
              <form action={applyToAllMatches}>
                {matches.map(({ job }) => (
                  <input key={job.id} type="hidden" name="job_ids" value={job.id} />
                ))}
                <button className="btn btn-pine">✦ Apply to all {matches.length} →</button>
              </form>
            )}
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="panel p-10 text-center text-[var(--muted)]">
            No matches right now.
            <form action={refreshJobs} className="inline">
              <input type="hidden" name="search" value={prefs.roles[0] ?? ""} />
              <button className="underline font-semibold mx-1">Find new matches</button>
            </form>
            (needs internet) or add jobs on the <Link href="/browse" className="underline">Browse jobs</Link> page.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {matches.map(({ job, match }, i) => (
              <MatchCard key={job.id} job={job} score={match.score} index={i} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-bold">All applications</h2>
          <div className="flex gap-2">
            <Link href="/tracker" className="btn">📋 Open tracker</Link>
            <Link href="/dashboard?filter=needs_you" className="btn btn-ghost">✓ Review pending</Link>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/dashboard?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`filter-pill ${filter.key === f.key ? "filter-pill-active" : ""}`}
            >
              {f.label} <span className="count">{counts[f.key]}</span>
            </Link>
          ))}
          <form method="GET" className="ml-auto">
            <input type="hidden" name="filter" value={filter.key} />
            <input name="company" defaultValue={sp.company ?? ""} className="input !w-52 !py-1.5 !text-xs" placeholder="🔍 Search company…" />
          </form>
        </div>

        <div className="panel overflow-x-auto !rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[var(--border)]">
                <th className="px-4 py-3 section-label">Company</th>
                <th className="px-4 py-3 section-label">Resume</th>
                <th className="px-4 py-3 section-label">Status</th>
                <th className="px-4 py-3 section-label">Applied</th>
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[var(--muted)]">
                    Nothing here yet — hit <b>Apply</b> on a match above.
                  </td>
                </tr>
              )}
              {apps.map((app) => (
                <tr key={app.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--panel-2)]/60">
                  <td className="px-4 py-2.5">
                    <Link
                      href={app.status === "pending_approval" ? `/applications/${app.id}/review` : `/applications/${app.id}`}
                      className="flex items-center gap-3 group"
                    >
                      <span className="avatar" style={{ background: avatarColor(app.company) }}>
                        {app.company.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <span className="font-bold block leading-tight group-hover:underline">{app.company}</span>
                        <span className="hint">{app.title}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {app.tailored_resume_json ? (
                      <span className="status status-submitted">Ready</span>
                    ) : app.resume_id ? (
                      <span className="status status-skipped">Default</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`status status-${app.status}`}>{STATUS_LABELS[app.status] ?? app.status}</span>
                    {app.status === "pending_approval" && (
                      <Link href={`/applications/${app.id}/review`} className="btn btn-sm btn-dark ml-2">Review</Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5 hint">{app.applied_at ? timeAgo(app.applied_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
