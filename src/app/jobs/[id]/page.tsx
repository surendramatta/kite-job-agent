import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, Application, Job, STATUS_LABELS } from "@/lib/db";
import { computeMatch, getDefaultResumeContent, getPreferences } from "@/lib/matching";
import { applyToJob, skipJob, hideJob } from "@/lib/actions";
import MatchRing from "@/components/MatchRing";

export const dynamic = "force-dynamic";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(Number(id)) as Job | undefined;
  if (!job) notFound();

  const app = db.prepare("SELECT * FROM applications WHERE job_id = ?").get(job.id) as
    | Application
    | undefined;
  const match = computeMatch(job, getDefaultResumeContent(), getPreferences());

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Link href="/dashboard" className="hint hover:text-[var(--text)]">← Back to dashboard</Link>

      <div className="panel p-6 flex items-start gap-5 flex-wrap">
        <MatchRing score={match.score} size={72} />
        <div className="flex-1 min-w-60">
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="hint mt-1">
            {job.company} · {job.location || (job.remote ? "Remote" : "—")}
            {job.salary ? ` · ${job.salary}` : ""}
            {job.job_type ? ` · ${job.job_type}` : ""}
          </p>
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {app && <span className={`badge badge-${app.status}`}>{STATUS_LABELS[app.status] ?? app.status}</span>}
            {job.ats_kind && <span className="badge">ATS: {job.ats_kind}</span>}
            <span className="badge">via {job.source}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn">Open posting ↗</a>
          {!app && (
            <div className="flex gap-2">
              <form action={applyToJob}>
                <input type="hidden" name="job_id" value={job.id} />
                <button className="btn btn-primary">Apply</button>
              </form>
              <form action={skipJob}>
                <input type="hidden" name="job_id" value={job.id} />
                <button className="btn btn-ghost">Skip</button>
              </form>
              <form action={hideJob}>
                <input type="hidden" name="id" value={job.id} />
                <button className="btn btn-ghost" title="Hide from feed">Hide</button>
              </form>
            </div>
          )}
          {app && (
            <Link
              href={app.status === "pending_approval" ? `/applications/${app.id}/review` : `/applications/${app.id}`}
              className="btn btn-primary"
            >
              {app.status === "pending_approval" ? "Review & send" : "View receipt"}
            </Link>
          )}
        </div>
      </div>

      <div className="panel p-6">
        <h2 className="font-bold mb-2">Why this matched</h2>
        <ul className="space-y-1 text-sm">
          {match.reasons.map((r) => (
            <li key={r} className="text-[var(--green)]">✓ {r}</li>
          ))}
          {match.cautions.map((c) => (
            <li key={c} className="text-[var(--amber)]">⚠ {c}</li>
          ))}
        </ul>
      </div>

      <div className="panel p-6">
        <h2 className="font-bold mb-3">Job description</h2>
        <div className="text-sm whitespace-pre-wrap leading-relaxed text-[var(--text)]/85">
          {job.description || "No description captured — open the posting for details."}
        </div>
      </div>
    </div>
  );
}
