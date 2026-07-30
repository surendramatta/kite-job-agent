"use client";

import { useState } from "react";

type Answer = { question: string; answer: string };

const WORK_PREFS: { key: string; label: string }[] = [
  { key: "in_person_ok", label: "In-person OK" },
  { key: "can_relocate", label: "Can relocate" },
  { key: "start_immediately", label: "Start immediately" },
  { key: "has_transport", label: "Has transport" },
  { key: "needs_accommodations", label: "Needs accommodations" },
  { key: "prior_employee", label: "Prior employee" },
  { key: "gov_clearance", label: "Gov clearance" },
];

export default function ProfileForm({
  action,
  profile,
  skills,
  answers: initialAnswers,
  workPrefs: initialPrefs,
}: {
  action: (formData: FormData) => void;
  profile: Record<string, string | number>;
  skills: string[];
  answers: Answer[];
  workPrefs: Record<string, boolean>;
}) {
  const [answers, setAnswers] = useState<Answer[]>(initialAnswers);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(initialPrefs);
  const [saved, setSaved] = useState(false);

  const text = (k: string) => String(profile[k] ?? "");

  return (
    <form
      action={(fd) => {
        action(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }}
      className="grid lg:grid-cols-[1fr_22rem] gap-5 items-start"
    >
      <input type="hidden" name="answers_json" value={JSON.stringify(answers)} />
      <input type="hidden" name="work_prefs_json" value={JSON.stringify(prefs)} />
      <input type="hidden" name="experience_json" value={text("experience_json") || "[]"} />
      <input type="hidden" name="education_json" value={text("education_json") || "[]"} />

      <div className="space-y-5">
        <div className="panel p-5 !rounded-2xl space-y-4">
          <h2 className="font-bold text-sm">Professional summary</h2>
          <textarea name="summary" className="textarea" rows={4} defaultValue={text("summary")}
            placeholder="A few sentences about what you do and what you're great at…" />
          <div className="grid grid-cols-2 gap-4">
            <div><span className="label">Full name</span><input name="full_name" className="input" defaultValue={text("full_name")} /></div>
            <div><span className="label">Headline</span><input name="headline" className="input" placeholder="e.g. Senior Frontend Engineer" defaultValue={text("headline")} /></div>
            <div><span className="label">Email</span><input name="email" type="email" className="input" defaultValue={text("email")} /></div>
            <div><span className="label">Phone</span><input name="phone" className="input" defaultValue={text("phone")} /></div>
            <div><span className="label">Location</span><input name="location" className="input" defaultValue={text("location")} /></div>
            <div><span className="label">Desired salary</span><input name="desired_salary" className="input" defaultValue={text("desired_salary")} /></div>
            <div><span className="label">LinkedIn</span><input name="linkedin" className="input" defaultValue={text("linkedin")} /></div>
            <div><span className="label">GitHub / Portfolio</span><input name="github" className="input" defaultValue={text("github")} /></div>
            <input type="hidden" name="portfolio" value={text("portfolio")} />
            <input type="hidden" name="notice_period" value={text("notice_period")} />
          </div>
          <div>
            <span className="label">Skills (comma separated)</span>
            <input name="skills" className="input" defaultValue={skills.join(", ")} />
          </div>
        </div>

        <div className="panel p-5 !rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm">Screening answers</h2>
              <p className="hint">Auto-fills open-ended ATS questions the bot recognizes.</p>
            </div>
            <button type="button" className="btn btn-sm"
              onClick={() => setAnswers([...answers, { question: "", answer: "" }])}>
              + Add
            </button>
          </div>
          {answers.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input className="input !text-xs" placeholder="Question contains… ('years of experience')"
                value={a.question}
                onChange={(e) => setAnswers(answers.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
              <input className="input !text-xs" placeholder="Answer"
                value={a.answer}
                onChange={(e) => setAnswers(answers.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
              <button type="button" className="btn btn-sm btn-danger"
                onClick={() => setAnswers(answers.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-dark btn-lg">Save profile</button>
          {saved && <span className="text-sm text-[var(--green)] font-semibold">Saved ✓</span>}
        </div>
      </div>

      {/* Application defaults */}
      <div className="panel p-5 !rounded-2xl space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="avatar !rounded-xl" style={{ background: "var(--green)" }}>📋</span>
          <div>
            <h2 className="font-bold">Application defaults</h2>
            <p className="hint">What we auto-fill on every ATS form.</p>
          </div>
        </div>

        <div>
          <div className="section-label mb-1.5">Work authorization</div>
          <select name="work_auth" className="select" defaultValue={text("work_auth")}>
            <option value="">Visa type…</option>
            {["US Citizen", "Green Card", "H-1B", "OPT", "STEM-OPT", "CPT", "EU Citizen", "Other"].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" name="needs_sponsorship" defaultChecked={profile.needs_sponsorship === 1} />
            Needs sponsorship
          </label>
        </div>

        <div>
          <div className="section-label mb-1.5">Work preferences</div>
          <div className="flex gap-1.5 flex-wrap">
            {WORK_PREFS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPrefs({ ...prefs, [p.key]: !prefs[p.key] })}
                className={`filter-pill ${prefs[p.key] ? "!bg-[var(--green-soft)] !text-[var(--green)] !border-[var(--green)]/30" : ""}`}
              >
                {prefs[p.key] ? "✓" : "✕"} {p.label}
              </button>
            ))}
          </div>
          <p className="hint mt-2">Toggle what applies — the apply bot answers these consistently everywhere.</p>
        </div>
      </div>
    </form>
  );
}
