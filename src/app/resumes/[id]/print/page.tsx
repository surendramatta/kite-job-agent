import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, getProfile, Resume } from "@/lib/db";
import { ResumeContent } from "@/lib/ats";
import PrintableResume from "@/components/PrintableResume";

export const dynamic = "force-dynamic";

export default async function PrintResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resume = getDb().prepare("SELECT * FROM resumes WHERE id = ?").get(Number(id)) as
    | Resume
    | undefined;
  if (!resume) notFound();

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center gap-3">
        <Link href="/resumes" className="btn">← Back</Link>
        <span className="text-sm text-[var(--muted)]">
          Use your browser&apos;s Print → Save as PDF to export.
        </span>
      </div>
      <PrintableResume profile={getProfile()} content={JSON.parse(resume.content_json)} />
    </div>
  );
}
