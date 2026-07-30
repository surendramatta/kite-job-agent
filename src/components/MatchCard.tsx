import Link from "next/link";
import { Job, timeAgo } from "@/lib/db";
import { applyToJob, skipJob } from "@/lib/actions";

const AVATAR_COLORS = ["#5145cd", "#c2410c", "#0e7490", "#7c3aed", "#15803d", "#be185d", "#374151"];

function scoreColor(score: number): string {
  return score >= 75 ? "var(--green)" : score >= 50 ? "var(--pine)" : "var(--coral)";
}

export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function MatchCard({
  job,
  score,
  index,
  showSave,
}: {
  job: Job;
  score: number;
  index: number;
  showSave?: boolean;
}) {
  const tags = (JSON.parse(job.tags_json) as string[]).slice(0, 3);
  void index;
  const color = scoreColor(score);
  return (
    <div className="match-card panel !rounded-2xl" style={{ borderTop: `4px solid ${color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[0.7rem] text-[var(--text)]/60 font-medium leading-snug">
          {job.location && <div>{job.location}</div>}
          <div>{job.posted_at ? timeAgo(job.posted_at) : "new"}</div>
        </div>
        <div className="score-kite" style={{ background: color }} title={`${score}% fit`}>
          <span>{score}%</span>
        </div>
      </div>

      <Link href={`/jobs/${job.id}`} className="mt-1 text-lg font-bold leading-snug hover:underline line-clamp-2">
        {job.title}
      </Link>

      <div className="mt-2 flex gap-1 flex-wrap items-center">
        {["greenhouse", "lever"].includes(job.ats_kind) ? (
          <span className="chip !bg-[var(--green-soft)] !text-[var(--green)]">⚡ Auto-apply</span>
        ) : (
          <span className="chip !bg-[var(--amber-soft)] !text-[var(--amber)]" title="Kite fills everything and guides you through the final click">
            ⚡ Assisted
          </span>
        )}
        {tags.slice(0, 2).map((t) => (
          <span key={t} className="chip">{t}</span>
        ))}
      </div>

      {showSave && (
        <div className="mt-3 -mx-1 border-t border-black/5 pt-2 flex text-[0.75rem] font-semibold">
          <Link href={`/jobs/${job.id}`} className="flex-1 text-center py-1 rounded-lg hover:bg-white/50">Details</Link>
        </div>
      )}

      <div className="mt-auto pt-3 flex items-center gap-1.5">
        <span className="avatar !w-6 !h-6 !text-[0.6rem]" style={{ background: avatarColor(job.company) }}>
          {job.company.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-xs font-semibold truncate flex-1" title={job.company}>{job.company}</span>
        <form action={skipJob}>
          <input type="hidden" name="job_id" value={job.id} />
          <button className="btn btn-sm !px-2.5 btn-ghost">Pass</button>
        </form>
        <form action={applyToJob}>
          <input type="hidden" name="job_id" value={job.id} />
          <button className="btn btn-sm !px-2.5 btn-dark">Apply</button>
        </form>
      </div>
    </div>
  );
}
