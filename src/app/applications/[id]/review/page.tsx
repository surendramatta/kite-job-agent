import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, Application, Job, Receipt, Resume } from "@/lib/db";
import { diffResume, ResumeContent, AtsReport } from "@/lib/ats";
import { approveAndSend, skipApplication, regenerateMaterials } from "@/lib/actions";
import MatchRing from "@/components/MatchRing";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(Number(id)) as
    | Application
    | undefined;
  if (!app) notFound();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(app.job_id) as Job;
  const resumeRow = app.resume_id
    ? (db.prepare("SELECT * FROM resumes WHERE id = ?").get(app.resume_id) as Resume | undefined)
    : undefined;

  const tailored = app.tailored_resume_json
    ? (JSON.parse(app.tailored_resume_json) as ResumeContent)
    : null;
  const original = resumeRow ? (JSON.parse(resumeRow.content_json) as ResumeContent) : null;
  const receipt = app.receipt_json ? (JSON.parse(app.receipt_json) as Receipt) : null;
  const report = app.ats_report_json ? (JSON.parse(app.ats_report_json) as AtsReport) : null;
  const diff = original && tailored ? diffResume(original, tailored, job.description) : [];

  const sent = app.status !== "pending_approval" && app.status !== "preparing" && app.status !== "needs_you";

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Link href="/dashboard" className="hint hover:text-[var(--text)]">← Back to dashboard</Link>

      <div className="panel p-6 flex items-start gap-5">
        {app.ats_score != null && <MatchRing score={app.ats_score} size={64} />}
        <div className="flex-1">
          <div className="hint font-semibold uppercase tracking-wide text-[var(--accent)]">
            Review before send
          </div>
          <h1 className="text-2xl font-bold mt-0.5">{job.title}</h1>
          <p className="hint mt-1">
            {job.company} · {job.location || (job.remote ? "Remote" : "—")}
            {job.salary ? ` · ${job.salary}` : ""} · via {receipt?.submitted_via || "career page"}
          </p>
        </div>
        <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn">
          Open posting ↗
        </a>
      </div>

      {app.notes && <div className="panel p-4 text-sm text-[var(--amber)]">{app.notes}</div>}

      {/* Diff view */}
      <div className="panel p-6">
        <h2 className="font-bold">Résumé changes for this role</h2>
        <p className="hint mt-0.5 mb-4">
          Only true facts from your résumé are used — content is reordered and emphasized, never invented.
        </p>
        <div className="space-y-2">
          {diff.map((d, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="badge badge-interview shrink-0">{d.section}</span>
              <span>{d.change}</span>
            </div>
          ))}
          {!tailored && <p className="hint">No tailored résumé yet — add a default résumé and regenerate.</p>}
        </div>
        {report && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] flex gap-6 text-sm flex-wrap">
            <div>
              <div className="label">Keywords covered</div>
              <div className="flex gap-1 flex-wrap max-w-md">
                {report.matched.slice(0, 10).map((k) => (
                  <span key={k.keyword} className="badge badge-offer">{k.keyword}</span>
                ))}
              </div>
            </div>
            {report.missing.length > 0 && (
              <div>
                <div className="label">Not on your résumé</div>
                <div className="flex gap-1 flex-wrap max-w-md">
                  {report.missing.slice(0, 8).map((k) => (
                    <span key={k.keyword} className="badge badge-failed">{k.keyword}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {app.id && tailored && (
          <div className="flex gap-2 mt-4">
            <Link href={`/applications/${app.id}/resume`} className="btn btn-sm">
              View full tailored résumé
            </Link>
            <a href={`/api/resume/tailored/${app.id}`} className="btn btn-sm btn-pine">
              ⬇ Download tailored PDF
            </a>
          </div>
        )}
      </div>

      {/* Fields + answers that will be submitted */}
      {receipt && (
        <div className="panel p-6">
          <h2 className="font-bold mb-3">Form fields that will be filled</h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {receipt.fields.map((f) => (
              <div key={f.label} className="flex justify-between gap-4 border-b border-[var(--border)] pb-1.5">
                <span className="text-[var(--muted)]">{f.label}</span>
                <span className="font-medium text-right">{f.value}</span>
              </div>
            ))}
          </div>
          {receipt.answers.length > 0 && (
            <>
              <h3 className="font-bold mt-5 mb-2 text-sm">Screening answers (in your voice)</h3>
              <div className="space-y-2 text-sm">
                {receipt.answers.map((a, i) => (
                  <div key={i}>
                    <div className="text-[var(--muted)]">{a.question}</div>
                    <div className="font-medium">{a.answer}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cover letter, editable */}
      <form action={approveAndSend} className="space-y-5">
        <input type="hidden" name="app_id" value={app.id} />
        <div className="panel p-6">
          <h2 className="font-bold mb-1">Cover letter</h2>
          <p className="hint mb-3">Edit freely — this exact text goes out.</p>
          <textarea
            name="cover_letter"
            className="textarea font-mono !text-[0.8rem]"
            rows={12}
            defaultValue={app.cover_letter ?? ""}
          />
        </div>

        {!sent ? (
          <div className="panel p-5 flex items-center gap-3 flex-wrap sticky bottom-4 shadow-lg">
            <button className="btn btn-success btn-lg">✓ Approve & send</button>
            <span className="hint flex-1">
              Nothing is submitted until you approve. Greenhouse/Lever postings are then submitted
              automatically by the Kite agent. Other ATSs: Kite readies everything and walks you
              through a 3-step finish — it will never claim &quot;submitted&quot; unless it really was.
            </span>
          </div>
        ) : (
          <div className="panel p-5 text-sm">
            This application was already sent — see the{" "}
            <Link className="text-[var(--accent)] underline" href={`/applications/${app.id}`}>receipt</Link>.
          </div>
        )}
      </form>

      {!sent && (
        <div className="flex gap-2">
          <form action={regenerateMaterials}>
            <input type="hidden" name="app_id" value={app.id} />
            <button className="btn btn-sm">↻ Regenerate materials</button>
          </form>
          <form action={skipApplication}>
            <input type="hidden" name="app_id" value={app.id} />
            <button className="btn btn-sm btn-danger">Skip this job</button>
          </form>
        </div>
      )}
    </div>
  );
}
