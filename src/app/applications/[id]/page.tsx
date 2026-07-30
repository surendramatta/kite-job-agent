import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, getSetting, Application, Job, Receipt, STATUS_LABELS, InboxMessage } from "@/lib/db";
import { updateAppStatus, confirmSubmitted } from "@/lib/actions";
import AgentReplay from "@/components/AgentReplay";
import { APP_STATUSES } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(Number(id)) as
    | Application
    | undefined;
  if (!app) notFound();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(app.job_id) as Job;
  const receipt = app.receipt_json ? (JSON.parse(app.receipt_json) as Receipt) : null;
  const events = db
    .prepare("SELECT * FROM app_events WHERE application_id = ? ORDER BY created_at DESC")
    .all(app.id) as { event: string; detail: string; created_at: string }[];
  const run = db
    .prepare("SELECT result, log, shots_json FROM bot_runs WHERE job_id = ? ORDER BY id DESC LIMIT 1")
    .get(app.job_id) as { result: string; log: string; shots_json: string } | undefined;
  const shots = run?.shots_json ? (JSON.parse(run.shots_json) as { file: string; caption: string }[]) : [];

  const messages = db
    .prepare("SELECT * FROM inbox_messages WHERE application_id = ? ORDER BY created_at ASC")
    .all(app.id) as InboxMessage[];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/dashboard" className="hint hover:text-[var(--text)]">← Back to dashboard</Link>

      <div className="panel p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="hint font-semibold uppercase tracking-wide text-[var(--accent)]">
              Application receipt
            </div>
            <h1 className="text-2xl font-bold mt-0.5">{job.title}</h1>
            <p className="hint mt-1">
              {job.company} · {job.location || (job.remote ? "Remote" : "—")}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`badge badge-${app.status}`}>{STATUS_LABELS[app.status] ?? app.status}</span>
              {app.applied_at && (
                <span className="hint">sent {new Date(app.applied_at + "Z").toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn">Open posting ↗</a>
            <form action={updateAppStatus} className="flex gap-1.5">
              <input type="hidden" name="app_id" value={app.id} />
              <select name="status" defaultValue={app.status} className="select !w-36 !text-xs !py-1">
                {APP_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button className="btn btn-sm">Update</button>
            </form>
          </div>
        </div>
      </div>

      {app.status === "in_flight" && (
        <div className="panel p-5 !rounded-2xl border-2 !border-[var(--blue)]/40 space-y-2">
          {getSetting("agent_last_error") ? (
            <>
              <p className="text-sm font-semibold text-[var(--red)]">
                ⚠ The agent can&apos;t run, so this application is waiting: {getSetting("agent_last_error")}
              </p>
              <p className="text-sm">
                Fix it in a terminal: <code className="bg-[var(--panel-2)] px-1.5 py-0.5 rounded">npx playwright install chromium</code>,
                restart Kite, then hit &quot;Run agent now&quot; on the Launchpad — or submit manually and use the confirm button below.
              </p>
              <form action={confirmSubmitted}>
                <input type="hidden" name="app_id" value={app.id} />
                <button className="btn btn-success btn-sm">✓ I submitted it manually</button>
              </form>
            </>
          ) : (
            <p className="text-sm">
              🛫 The Kite agent has this one — it fills the form, uploads your tailored resume, and
              this page flips to <b>Submitted</b> with a receipt when done (usually within a minute
              or two). If it hits something it can&apos;t handle, it lands in <b>Needs you</b> honestly.
            </p>
          )}
        </div>
      )}

      {app.status === "needs_you" && app.notes.includes("Materials ready") && (
        <div className="panel p-5 !rounded-2xl border-2 !border-[var(--amber)]/40 space-y-3">
          <p className="text-sm font-semibold">
            ✋ Not submitted yet. Kite prepared everything, but this ATS ({job.ats_kind || "career page"})
            needs you to submit — open the posting, paste/upload the materials below, then confirm.
          </p>
          <div className="flex gap-2 flex-wrap">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-dark btn-sm">
              1 · Open posting ↗
            </a>
            {app.tailored_resume_json && (
              <a href={`/api/resume/tailored/${app.id}`} className="btn btn-sm">2 · Download tailored PDF</a>
            )}
            <form action={confirmSubmitted}>
              <input type="hidden" name="app_id" value={app.id} />
              <button className="btn btn-success btn-sm">3 · ✓ I submitted it</button>
            </form>
          </div>
        </div>
      )}

      {run && shots.length > 0 && (
        <AgentReplay jobId={app.job_id} shots={shots} log={run.log} result={run.result} />
      )}

      {receipt && (
        <div className="panel p-6 space-y-5">
          <div>
            <h2 className="font-bold mb-2">Exactly what was submitted</h2>
            {receipt.confirmation && (
              <p className="text-sm text-[var(--green)] mb-3">✓ {receipt.confirmation}</p>
            )}
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {receipt.fields.map((f) => (
                <div key={f.label} className="flex justify-between gap-4 border-b border-[var(--border)] pb-1.5">
                  <span className="text-[var(--muted)]">{f.label}</span>
                  <span className="font-medium text-right">{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          {receipt.answers.length > 0 && (
            <div>
              <h3 className="font-bold text-sm mb-2">Answers given</h3>
              <div className="space-y-2 text-sm">
                {receipt.answers.map((a, i) => (
                  <div key={i}>
                    <div className="text-[var(--muted)]">{a.question}</div>
                    <div className="font-medium">{a.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap text-sm">
            <span className="badge badge-offer">📄 {receipt.resume_name}</span>
            {receipt.cover_letter_included && <span className="badge badge-offer">✉ cover letter included</span>}
            <span className="badge">via {receipt.submitted_via}</span>
          </div>
          <div className="flex gap-2">
            {app.tailored_resume_json && (
              <Link href={`/applications/${app.id}/resume`} className="btn btn-sm">View résumé sent</Link>
            )}
          </div>
        </div>
      )}

      {app.cover_letter && (
        <details className="panel p-6">
          <summary className="cursor-pointer font-bold text-sm">Cover letter that went out</summary>
          <div className="text-sm whitespace-pre-wrap leading-relaxed mt-3 text-[var(--text)]/85">
            {app.cover_letter}
          </div>
        </details>
      )}

      {messages.length > 0 && (
        <div className="panel p-6">
          <h2 className="font-bold mb-3">Recruiter thread</h2>
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`text-sm p-3 rounded-xl ${m.direction === "inbound" ? "bg-[var(--panel-2)]" : "bg-[var(--accent-soft)]"}`}>
                <div className="hint mb-1">
                  {m.direction === "inbound" ? m.from_name || "Recruiter" : "You"} ·{" "}
                  {new Date(m.created_at + "Z").toLocaleString()}
                  {m.subject ? ` · ${m.subject}` : ""}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            ))}
          </div>
          <Link href="/inbox" className="btn btn-sm mt-3">Reply in Inbox</Link>
        </div>
      )}

      <div className="panel p-6">
        <h2 className="font-bold mb-3">Timeline</h2>
        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="badge">{e.event}</span>
              <span className="flex-1">{e.detail}</span>
              <span className="hint">{new Date(e.created_at + "Z").toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
