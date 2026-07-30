"use client";

import { useState } from "react";
import Link from "next/link";
import { ResumeContent } from "@/lib/ats";
import { Profile } from "@/lib/db";

type Exp = NonNullable<ResumeContent["experience"]>[number];
type Edu = NonNullable<ResumeContent["education"]>[number];

export default function ResumeStudio({
  action,
  id,
  name,
  content,
  profile,
}: {
  action: (formData: FormData) => void;
  id?: number;
  name?: string;
  content?: ResumeContent;
  profile: Profile;
}) {
  const [summary, setSummary] = useState(content?.summary ?? "");
  const [skills, setSkills] = useState((content?.skills ?? []).join(", "));
  const [experience, setExperience] = useState<Exp[]>(content?.experience ?? []);
  const [education, setEducation] = useState<Edu[]>(content?.education ?? []);
  const skillList = skills.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="grid lg:grid-cols-[26rem_1fr] gap-6 items-start">
      {/* Editor */}
      <form action={action} className="space-y-4 no-print">
        {id ? <input type="hidden" name="id" value={id} /> : null}
        <input type="hidden" name="experience_json" value={JSON.stringify(experience)} />
        <input type="hidden" name="education_json" value={JSON.stringify(education)} />
        <input type="hidden" name="summary" value={summary} />
        <input type="hidden" name="skills" value={skills} />

        <div className="panel p-5 space-y-3 !rounded-2xl">
          <div>
            <span className="label">Version name</span>
            <input name="name" className="input" defaultValue={name ?? ""} placeholder="e.g. Default" required />
          </div>
          <div>
            <span className="label">Professional summary</span>
            <textarea className="textarea" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div>
            <span className="label">Skills (comma separated)</span>
            <textarea className="textarea" rows={3} value={skills} onChange={(e) => setSkills(e.target.value)} />
          </div>
        </div>

        <div className="panel p-5 space-y-3 !rounded-2xl">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Experience</h2>
            <button type="button" className="btn btn-sm"
              onClick={() => setExperience([{ title: "", company: "", start: "", end: "", bullets: [""] }, ...experience])}>
              + Add role
            </button>
          </div>
          {experience.map((exp, i) => (
            <div key={i} className="border border-[var(--border)] rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input !text-xs" placeholder="Job title" value={exp.title}
                  onChange={(e) => patch(setExperience, experience, i, { title: e.target.value })} />
                <input className="input !text-xs" placeholder="Company" value={exp.company}
                  onChange={(e) => patch(setExperience, experience, i, { company: e.target.value })} />
                <input className="input !text-xs" placeholder="Start (Jan 2022)" value={exp.start ?? ""}
                  onChange={(e) => patch(setExperience, experience, i, { start: e.target.value })} />
                <input className="input !text-xs" placeholder="End (Present)" value={exp.end ?? ""}
                  onChange={(e) => patch(setExperience, experience, i, { end: e.target.value })} />
              </div>
              <textarea className="textarea !text-xs" rows={4} placeholder="Achievement bullets, one per line"
                value={exp.bullets.join("\n")}
                onChange={(e) => patch(setExperience, experience, i, { bullets: e.target.value.split("\n") })} />
              <button type="button" className="btn btn-sm btn-danger"
                onClick={() => setExperience(experience.filter((_, j) => j !== i))}>
                Remove role
              </button>
            </div>
          ))}
        </div>

        <div className="panel p-5 space-y-3 !rounded-2xl">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Education</h2>
            <button type="button" className="btn btn-sm"
              onClick={() => setEducation([...education, { school: "", degree: "", year: "" }])}>
              + Add
            </button>
          </div>
          {education.map((edu, i) => (
            <div key={i} className="border border-[var(--border)] rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <input className="input !text-xs" placeholder="School / University" value={edu.school}
                  onChange={(e) => patch(setEducation, education, i, { school: e.target.value })} />
                <button type="button" className="btn btn-sm btn-danger shrink-0"
                  onClick={() => setEducation(education.filter((_, j) => j !== i))}>✕</button>
              </div>
              <input className="input !text-xs" placeholder="Degree & field (e.g. B.S. Computer Science)" value={edu.degree}
                onChange={(e) => patch(setEducation, education, i, { degree: e.target.value })} />
              <input className="input !text-xs" placeholder="Dates (e.g. Aug 2018 – May 2022)" value={edu.year ?? ""}
                onChange={(e) => patch(setEducation, education, i, { year: e.target.value })} />
            </div>
          ))}
          {education.length === 0 && (
            <p className="hint">No education parsed — add it here and it'll appear on every tailored resume.</p>
          )}
        </div>

        <div className="panel p-3 !rounded-xl text-xs flex items-center gap-3">
          <span className="font-bold whitespace-nowrap">Resume strength</span>
          <div className="flex-1 h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(((summary ? 1 : 0) + (skillList.length >= 5 ? 1 : 0) + (experience.length ? 1 : 0) + (experience.some((e) => e.bullets.filter(Boolean).length >= 2) ? 1 : 0) + (education.length ? 1 : 0)) / 5 * 100)}%`,
                background: "linear-gradient(90deg, var(--coral), var(--green))",
              }}
            />
          </div>
          <span className="hint whitespace-nowrap">
            {[summary && "summary", skillList.length >= 5 && "skills", experience.length && "roles", education.length && "education"].filter(Boolean).length}/4 sections
          </span>
        </div>

        <div className="flex gap-2 sticky bottom-4">
          <button className="btn btn-dark btn-lg flex-1">Save version</button>
        </div>
      </form>

      {/* Live document preview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between no-print">
          <span className="hint">● Live preview — updates as you type</span>
          {id && (
            <Link href={`/resumes/${id}/print`} className="btn btn-pine btn-sm">⬇ Download / PDF</Link>
          )}
        </div>
        <div className="doc p-10 max-w-3xl mx-auto text-[0.8rem] leading-relaxed text-gray-900">
          <h1 className="text-center text-xl font-bold">{profile.full_name || "Your Name"}</h1>
          <p className="text-center text-[0.72rem] text-gray-700 mt-1">
            {[profile.location, profile.email, profile.phone, profile.linkedin.replace(/^https?:\/\//, "")]
              .filter(Boolean)
              .join(" | ")}
          </p>
          {summary && (
            <section className="mt-4">
              <h2 className="font-bold text-[0.78rem] tracking-wide border-b border-gray-800 pb-0.5 mb-1.5">PROFESSIONAL SUMMARY</h2>
              <p>{summary}</p>
            </section>
          )}
          {skillList.length > 0 && (
            <section className="mt-4">
              <h2 className="font-bold text-[0.78rem] tracking-wide border-b border-gray-800 pb-0.5 mb-1.5">SKILLS</h2>
              <p>{skillList.join(", ")}</p>
            </section>
          )}
          {experience.length > 0 && (
            <section className="mt-4">
              <h2 className="font-bold text-[0.78rem] tracking-wide border-b border-gray-800 pb-0.5 mb-1.5">EXPERIENCE</h2>
              {experience.map((exp, i) => (
                <div key={i} className="mt-2">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold">{exp.title}{exp.company ? ` — ${exp.company}` : ""}</span>
                    <span className="text-[0.7rem] text-gray-600">{[exp.start, exp.end].filter(Boolean).join(" – ")}</span>
                  </div>
                  <ul className="list-disc ml-5 mt-0.5 space-y-0.5">
                    {exp.bullets.filter(Boolean).map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
          {education.length > 0 && (
            <section className="mt-4">
              <h2 className="font-bold text-[0.78rem] tracking-wide border-b border-gray-800 pb-0.5 mb-1.5">EDUCATION</h2>
              {education.map((edu, i) => (
                <div key={i} className="flex justify-between items-baseline mt-1">
                  <span><b>{edu.degree}</b>{edu.school ? `, ${edu.school}` : ""}</span>
                  <span className="text-[0.7rem] text-gray-600">{edu.year}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function patch<T>(set: (v: T[]) => void, arr: T[], i: number, p: Partial<T>) {
  set(arr.map((item, j) => (j === i ? { ...item, ...p } : item)));
}
