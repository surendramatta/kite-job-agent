import Link from "next/link";
import { getDb, getProfile, Resume } from "@/lib/db";
import { saveResume, setDefaultResume, deleteResume, duplicateResume } from "@/lib/actions";
import { ResumeContent } from "@/lib/ats";
import ResumeStudio from "@/components/ResumeStudio";
import ResumeUpload from "@/components/ResumeUpload";

export const dynamic = "force-dynamic";

export default async function ResumePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const db = getDb();
  const resumes = db
    .prepare("SELECT * FROM resumes ORDER BY is_default DESC, updated_at DESC")
    .all() as Resume[];
  const selected = v
    ? resumes.find((r) => r.id === Number(v))
    : resumes.find((r) => r.is_default === 1) ?? resumes[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Resume <span className="filter-pill !py-0.5">PDF</span>
          </h1>
          <p className="hint">
            Tweak how it reads and looks. Each version carries its own emphasis — the default powers
            matching and tailoring.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="section-label mr-1">Version</span>
        {resumes.map((r) => (
          <Link
            key={r.id}
            href={`/resumes?v=${r.id}`}
            className={`filter-pill ${selected?.id === r.id ? "filter-pill-active" : ""}`}
          >
            {r.is_default === 1 ? "★ " : ""}
            {r.name}
          </Link>
        ))}
        <form action={saveResume} className="inline">
          <input type="hidden" name="name" value={`Version ${resumes.length + 1}`} />
          <input type="hidden" name="summary" value="" />
          <input type="hidden" name="skills" value="" />
          <input type="hidden" name="experience_json" value="[]" />
          <input type="hidden" name="education_json" value="[]" />
          <button className="filter-pill">+ New</button>
        </form>
        <ResumeUpload />
        {selected && (
          <div className="ml-auto flex gap-2">
            {selected.is_default !== 1 && (
              <>
                <form action={setDefaultResume}>
                  <input type="hidden" name="id" value={selected.id} />
                  <button className="btn btn-sm">★ Make default</button>
                </form>
                <form action={deleteResume}>
                  <input type="hidden" name="id" value={selected.id} />
                  <button className="btn btn-sm btn-danger">Delete</button>
                </form>
              </>
            )}
            <form action={duplicateResume}>
              <input type="hidden" name="id" value={selected.id} />
              <button className="btn btn-sm">⧉ Duplicate</button>
            </form>
          </div>
        )}
      </div>

      {selected ? (
        <ResumeStudio
          key={selected.id}
          action={saveResume}
          id={selected.id}
          name={selected.name}
          content={JSON.parse(selected.content_json) as ResumeContent}
          profile={getProfile()}
        />
      ) : (
        <ResumeStudio action={saveResume} profile={getProfile()} />
      )}
    </div>
  );
}
