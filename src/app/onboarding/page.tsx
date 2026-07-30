import { getProfile, getSetting } from "@/lib/db";
import { completeOnboarding } from "@/lib/actions";
import { redirect } from "next/navigation";
import ResumeUpload from "@/components/ResumeUpload";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  if (getSetting("onboarded") === "1") redirect("/dashboard");
  const profile = getProfile();

  return (
    <div className="max-w-xl mx-auto space-y-6 py-6">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          🪁 Fly your job hunt
          <br />
          <span className="text-[var(--muted)]">on autopilot.</span>
        </h1>
        <p className="hint mt-3 text-sm">
          Kite finds roles that fit you, tailors your résumé and cover letter for each one, and
          applies — with you in control of what goes out.
        </p>
      </div>

      <div className="panel p-6 !rounded-2xl">
        <ResumeUpload big />
      </div>

      <div className="text-center section-label">Then answer five quick questions</div>

      <form action={completeOnboarding} className="space-y-4">
        <div className="panel p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="label">Your name</span>
              <input name="full_name" className="input" defaultValue={profile.full_name} required />
            </div>
            <div>
              <span className="label">Email</span>
              <input name="email" type="email" className="input" defaultValue={profile.email} required />
            </div>
          </div>

          <div>
            <span className="label">1 · What roles are you looking for?</span>
            <input name="roles" className="input" placeholder="e.g. frontend engineer, full stack, react developer" required />
            <p className="hint mt-1">Comma-separated. Matched against job titles and tags.</p>
          </div>

          <div>
            <span className="label">2 · Where do you want to work?</span>
            <input name="locations" className="input" placeholder="e.g. San Francisco, New York — leave empty for anywhere" />
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" name="remote_only" /> Remote roles only
            </label>
          </div>

          <div>
            <span className="label">3 · Minimum salary (annual, optional)</span>
            <input name="salary_min" type="number" className="input" placeholder="e.g. 120000" />
          </div>

          <div>
            <span className="label">4 · Experience level</span>
            <select name="experience" className="select" defaultValue="">
              <option value="">Any</option>
              <option value="entry">Entry / New grad</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="staff">Staff+ / Lead</option>
            </select>
          </div>

          <div>
            <span className="label">5 · Work authorization</span>
            <select name="work_auth" className="select" defaultValue={profile.work_auth || ""}>
              <option value="">Prefer not to say</option>
              <option value="US Citizen">US Citizen</option>
              <option value="Green Card">Green Card</option>
              <option value="H-1B">H-1B</option>
              <option value="OPT">OPT</option>
              <option value="STEM-OPT">STEM-OPT</option>
              <option value="EU Citizen">EU Citizen</option>
              <option value="Other">Other</option>
            </select>
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" name="needs_sponsorship" defaultChecked={profile.needs_sponsorship === 1} />
              I need visa sponsorship — flag postings that say they don&apos;t sponsor
            </label>
          </div>
        </div>

        <button className="btn btn-primary btn-lg w-full">Continue → add your résumé</button>
        <p className="hint text-center">
          Next step: your résumé. It powers matching, tailoring, and every application.
        </p>
      </form>
    </div>
  );
}
