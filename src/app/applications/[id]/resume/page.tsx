import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, getProfile, Application, Job } from "@/lib/db";
import PrintableResume from "@/components/PrintableResume";

export const dynamic = "force-dynamic";

export default async function TailoredResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(Number(id)) as
    | Application
    | undefined;
  if (!app || !app.tailored_resume_json) notFound();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(app.job_id) as Job;

  return (
    <div className="space-y-4">
      <div className="no-print panel p-4 !rounded-2xl space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={`/jobs/${app.job_id}`} className="btn btn-sm">← Back to job</Link>
          <a href={`/api/resume/tailored/${app.id}`} className="btn btn-sm btn-dark">⬇ Download as PDF</a>
        </div>
        <p className="text-sm">
          <b>What is this?</b> This is the version of <i>your</i> resume that Kite rewrote for{" "}
          <b>{job.title}</b> at <b>{job.company}</b>
          {app.ats_score != null ? <> (keyword match {app.ats_score}%)</> : null}. Same true facts,
          reordered so the skills and achievements this job screens for come first. This exact
          version is what gets attached to this application — your base resume is untouched.
        </p>
      </div>
      <PrintableResume profile={getProfile()} content={JSON.parse(app.tailored_resume_json)} />
    </div>
  );
}
