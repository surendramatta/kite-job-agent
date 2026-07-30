import { getDb, STATUS_LABELS } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const rows = getDb()
    .prepare(
      `SELECT j.company, j.title, j.url, a.status, a.ats_score, a.applied_at, a.notes
       FROM applications a JOIN jobs j ON j.id = a.job_id ORDER BY a.created_at DESC`
    )
    .all() as { company: string; title: string; url: string; status: string; ats_score: number | null; applied_at: string | null; notes: string }[];

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["Company", "Position", "URL", "Status", "ATS Score", "Applied", "Notes"].join(","),
    ...rows.map((r) =>
      [r.company, r.title, r.url, STATUS_LABELS[r.status] ?? r.status, r.ats_score ?? "", r.applied_at ?? "", r.notes].map(esc).join(",")
    ),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="tsenta-applications.csv"',
    },
  });
}
