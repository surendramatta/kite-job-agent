import { getDb, Job } from "@/lib/db";
import { computeMatch, getDefaultResumeContent, getPreferences, isExcluded } from "@/lib/matching";
import { addJobByUrl, refreshJobs } from "@/lib/actions";
import MatchCard from "@/components/MatchCard";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

type SP = { q?: string; workplace?: string; role?: string; location?: string; jobtype?: string; days?: string; exp?: string; salary?: string; source?: string; companyq?: string; sort?: string };

export default async function BrowseJobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = sp.q ?? "";
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

  const jobs = db
    .prepare(
      `SELECT j.* FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE ${where} ORDER BY j.posted_at DESC NULLS LAST, j.fetched_at DESC LIMIT 200`
    )
    .all(...params) as Job[];

  const sourceList = (db.prepare("SELECT DISTINCT source FROM jobs ORDER BY source").all() as { source: string }[]).map((s) => s.source);

  const scored = jobs
    .filter((j) => !isExcluded(j, prefs))
    .map((job) => ({ job, match: computeMatch(job, resume, prefs) }))
    .sort((a, b) =>
      sp.sort === "new"
        ? String(b.job.posted_at ?? "").localeCompare(String(a.job.posted_at ?? ""))
        : b.match.score - a.match.score
    )
    .slice(0, 40);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🔭 Discover</h1>
      <FilterBar q={q} sp={sp as Record<string, string>} sources={sourceList} />

      <div className="flex items-center justify-between">
        <span className="hint">{scored.length} roles found for you · Jobs look off? Tune your preferences in Controls.</span>
        <form action={refreshJobs}>
          <input type="hidden" name="search" value={prefs.roles[0] ?? ""} />
          <button className="btn">↻ Refresh feed</button>
        </form>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <div id="add" className="match-card !bg-[var(--card-mint)]">
          <div className="flex items-start justify-between">
            <div className="text-[0.7rem] text-[var(--text)]/60 font-medium">
              Greenhouse, Lever
              <br />
              etc.
            </div>
            <span className="w-11 h-11 rounded-full bg-[var(--green)] text-white flex items-center justify-center text-xl font-bold">+</span>
          </div>
          <div className="mt-2 text-xl font-bold leading-snug">Add Your Own Link</div>
          <p className="text-xs mt-1 text-[var(--text)]/70">Paste a URL and optional job description</p>
          <details className="mt-auto pt-3">
            <summary className="btn btn-sm btn-dark cursor-pointer inline-flex">+ Add</summary>
            <form action={addJobByUrl} className="mt-3 space-y-2">
              <input name="url" className="input !text-xs" required placeholder="Job URL *" />
              <input name="title" className="input !text-xs" required placeholder="Job title *" />
              <input name="company" className="input !text-xs" required placeholder="Company *" />
              <input name="location" className="input !text-xs" placeholder="Location" />
              <textarea name="description" className="textarea !text-xs" rows={3} placeholder="Paste job description (for matching & tailoring)" />
              <button className="btn btn-sm btn-dark w-full">Add to queue</button>
            </form>
          </details>
        </div>

        {scored.map(({ job, match }, i) => (
          <MatchCard key={job.id} job={job} score={match.score} index={i + 1} showSave />
        ))}
      </div>

      {scored.length === 0 && (
        <div className="panel p-10 text-center text-[var(--muted)]">
          No jobs in the feed yet. Hit <b>↻ Refresh feed</b> (needs internet) or run <code>npm run seed</code> for demo data.
        </div>
      )}
    </div>
  );
}
