import Link from "next/link";
import { getDb, getProfile, Resume } from "@/lib/db";
import { saveProfile } from "@/lib/actions";
import ProfileForm from "@/components/ProfileForm";
import { avatarColor } from "@/components/MatchCard";
import { ResumeContent } from "@/lib/ats";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const profile = getProfile();
  const resumes = getDb()
    .prepare("SELECT * FROM resumes ORDER BY is_default DESC, updated_at DESC")
    .all() as Resume[];
  const initials = (profile.full_name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const fields = [
    profile.full_name, profile.email, profile.phone, profile.location, profile.headline,
    profile.summary, profile.linkedin, profile.work_auth,
  ];
  const completeness = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  return (
    <div className="space-y-6">
      <div>
        <div className="section-label mb-2">Identity &amp; documents</div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="panel p-4 !rounded-2xl flex items-center gap-3">
            <span className="avatar !w-12 !h-12 !text-base !rounded-2xl" style={{ background: "var(--pine)" }}>
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">{profile.full_name || "Add your name"}</span>
                <span className="status status-submitted">Open to work</span>
                {completeness < 100 && <span className="status status-needs_you">{completeness}% complete</span>}
              </div>
              <div className="hint truncate">
                {[profile.location, profile.email].filter(Boolean).join(" · ") || "Fill in your details below"}
              </div>
            </div>
            <a href="#details" className="hint font-semibold whitespace-nowrap">Edit →</a>
          </div>

          <div className="panel p-4 !rounded-2xl flex items-center gap-3">
            <span className="avatar !w-12 !h-12 !text-base !rounded-2xl" style={{ background: "#3568c9" }}>📄</span>
            <div className="flex-1">
              <div className="font-bold">Resume</div>
              <div className="hint">Wording, order and formatting in the editor.</div>
            </div>
            <Link href="/resumes" className="hint font-semibold whitespace-nowrap">Edit →</Link>
          </div>

          <div className="panel p-4 !rounded-2xl flex items-center gap-3">
            <span className="avatar !w-12 !h-12 !text-base !rounded-2xl" style={{ background: "#7c3aed" }}>✉</span>
            <div className="flex-1">
              <div className="font-bold">Cover letter</div>
              <div className="hint">Default letter, tailored per application.</div>
            </div>
            <Link href="/settings" className="hint font-semibold whitespace-nowrap">Edit →</Link>
          </div>
        </div>
      </div>

      <div>
        <div className="section-label mb-2">
          Resume versions <span className="normal-case font-medium">(each carries its own experience emphasis &amp; formatting)</span>
        </div>
        <div className="flex gap-3 flex-wrap">
          {resumes.map((r) => {
            const c = JSON.parse(r.content_json) as ResumeContent;
            return (
              <Link key={r.id} href={`/resumes?v=${r.id}`} className="panel p-4 !rounded-2xl w-56 hover:border-[var(--dark)]">
                <div className="flex items-center justify-between">
                  <span className="status status-submitted">Editing</span>
                  {r.is_default === 1 && <span className="section-label">Default</span>}
                </div>
                <div className="font-bold mt-2">{r.name}</div>
                <div className="hint mt-1">
                  {(c.experience ?? []).length} roles · {(c.skills ?? []).length} skills
                </div>
              </Link>
            );
          })}
          <Link href="/resumes" className="panel p-4 !rounded-2xl w-56 border-dashed flex flex-col items-center justify-center text-center hover:border-[var(--dark)]">
            <span className="w-9 h-9 rounded-full bg-[var(--panel-2)] flex items-center justify-center text-lg">+</span>
            <span className="font-bold text-sm mt-1.5">New version</span>
            <span className="hint">Duplicate or start fresh</span>
          </Link>
        </div>
      </div>

      <div id="details">
        <div className="section-label mb-2">Profile details</div>
        <ProfileForm
          action={saveProfile}
          profile={profile as unknown as Record<string, string | number>}
          skills={JSON.parse(profile.skills_json)}
          answers={JSON.parse(profile.answers_json)}
          workPrefs={JSON.parse(profile.work_prefs_json || "{}")}
        />
      </div>
    </div>
  );
}
