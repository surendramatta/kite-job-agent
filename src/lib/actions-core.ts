// Core application-preparation logic shared by user actions and the
// background worker.
import { getDb, getProfile, logEvent, Job, Receipt, Resume } from "./db";
import { tailorResume, ResumeContent } from "./ats";
import { generateCoverLetter } from "./coverletter";

export async function prepareMaterials(appId: number, job: Job) {
  const db = getDb();
  const resumeRow = db.prepare("SELECT * FROM resumes WHERE is_default = 1").get() as
    | Resume
    | undefined;
  const profile = getProfile();

  if (!resumeRow) {
    db.prepare(
      "UPDATE applications SET status = 'needs_you', notes = 'Add a résumé first', updated_at = datetime('now') WHERE id = ?"
    ).run(appId);
    return;
  }

  const content = JSON.parse(resumeRow.content_json) as ResumeContent;
  const { tailored, report } = tailorResume(content, job.description);
  const { text: coverLetter } = await generateCoverLetter(job, profile, tailored);
  const answers = JSON.parse(profile.answers_json || "[]") as { question: string; answer: string }[];

  const receipt: Receipt = {
    fields: [
      { label: "Full name", value: profile.full_name },
      { label: "Email", value: profile.email },
      { label: "Phone", value: profile.phone },
      { label: "Location", value: profile.location },
      { label: "LinkedIn", value: profile.linkedin },
      { label: "Work authorization", value: profile.work_auth },
      { label: "Requires sponsorship", value: profile.needs_sponsorship ? "Yes" : "No" },
    ].filter((f) => f.value),
    answers,
    resume_name: `${resumeRow.name} (tailored for ${job.company})`,
    cover_letter_included: true,
    submitted_via: job.ats_kind || "detecting…",
    confirmation: "",
    submitted_at: "",
  };

  db.prepare(
    `UPDATE applications SET status = 'pending_approval', resume_id = ?, tailored_resume_json = ?,
     cover_letter = ?, ats_score = ?, ats_report_json = ?, receipt_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    resumeRow.id,
    JSON.stringify(tailored),
    coverLetter,
    report.score,
    JSON.stringify(report),
    JSON.stringify(receipt),
    appId
  );
  logEvent(appId, "prepared", `materials ready · ATS ${report.score}%`);
}

// Marks an application approved: bot-capable ATSes go In flight for the
// agent; everything else counts as submitted via the career page.
export function approveApplication(appId: number): void {
  const db = getDb();
  const app = db
    .prepare(
      "SELECT a.id, a.job_id, a.receipt_json, j.ats_kind FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?"
    )
    .get(appId) as { id: number; job_id: number; receipt_json: string | null; ats_kind: string } | undefined;
  if (!app) return;

  const receipt = (app.receipt_json ? JSON.parse(app.receipt_json) : { fields: [], answers: [] }) as Receipt;

  // Always hand the job to the agent. It opens the posting, resolves whatever
  // ATS is really behind it, and fills + submits. Only if it genuinely can't
  // finish does the application come back to you — never before trying.
  receipt.confirmation = "Approved — the Kite agent is submitting this application";
  db.prepare(
    `UPDATE applications SET status = 'in_flight', receipt_json = ?, applied_at = datetime('now'),
     updated_at = datetime('now'), notes = '' WHERE id = ?`
  ).run(JSON.stringify(receipt), appId);
  db.prepare("INSERT OR IGNORE INTO apply_queue (job_id) VALUES (?)").run(app.job_id);
  db.prepare("UPDATE apply_queue SET state = 'pending', attempts = 0 WHERE job_id = ?").run(app.job_id);
  logEvent(appId, "approved", "handed to the agent");
}

export function confirmSubmittedCore(appId: number) {
  const db = getDb();
  const app = db.prepare("SELECT receipt_json FROM applications WHERE id = ?").get(appId) as
    | { receipt_json: string | null }
    | undefined;
  if (!app) return;
  const receipt = (app.receipt_json ? JSON.parse(app.receipt_json) : { fields: [], answers: [] }) as Receipt;
  receipt.submitted_at = new Date().toISOString();
  receipt.confirmation = "Submitted by you on the career page — confirmed";
  db.prepare(
    `UPDATE applications SET status = 'submitted', receipt_json = ?, notes = '',
     applied_at = COALESCE(applied_at, datetime('now')), updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(receipt), appId);
  logEvent(appId, "submitted", "confirmed by you");
}

export async function prepareAndMaybeApprove(jobId: number, handsOff: boolean): Promise<number | null> {
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as Job | undefined;
  if (!job) return null;
  const existing = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(jobId) as
    | { id: number }
    | undefined;
  if (existing) return null;

  const info = db.prepare("INSERT INTO applications (job_id, status) VALUES (?, 'preparing')").run(jobId);
  const appId = Number(info.lastInsertRowid);
  await prepareMaterials(appId, job);
  if (handsOff) approveApplication(appId);
  return appId;
}
