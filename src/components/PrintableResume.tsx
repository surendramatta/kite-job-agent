import { Profile } from "@/lib/db";
import { ResumeContent } from "@/lib/ats";

export default function PrintableResume({
  profile,
  content,
}: {
  profile: Profile;
  content: ResumeContent;
}) {
  return (
    <div className="bg-white text-gray-900 max-w-[52rem] mx-auto p-10 rounded-lg print:p-0 print:rounded-none">
      <header className="border-b-2 border-gray-800 pb-4">
        <h1 className="text-3xl font-bold">{profile.full_name || "Your Name"}</h1>
        {profile.headline && <p className="text-lg text-gray-700">{profile.headline}</p>}
        <p className="text-sm text-gray-600 mt-1">
          {[profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.portfolio]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {content.summary && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide border-b border-gray-300 pb-1">Summary</h2>
          <p className="text-sm mt-2 leading-relaxed">{content.summary}</p>
        </section>
      )}

      {content.skills && content.skills.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide border-b border-gray-300 pb-1">Skills</h2>
          <p className="text-sm mt-2">{content.skills.join(" · ")}</p>
        </section>
      )}

      {content.experience && content.experience.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide border-b border-gray-300 pb-1">Experience</h2>
          {content.experience.map((exp, i) => (
            <div key={i} className="mt-3">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-sm">
                  {exp.title}
                  {exp.company ? ` — ${exp.company}` : ""}
                </span>
                <span className="text-xs text-gray-600">
                  {[exp.start, exp.end].filter(Boolean).join(" – ")}
                </span>
              </div>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                {exp.bullets.filter(Boolean).map((b, j) => (
                  <li key={j} className="text-sm leading-snug">{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.education && content.education.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide border-b border-gray-300 pb-1">Education</h2>
          {content.education.map((edu, i) => (
            <div key={i} className="flex justify-between items-baseline mt-2">
              <span className="text-sm">
                <b>{edu.school || edu.degree}</b>
                {edu.school && edu.degree ? ` — ${edu.degree}` : ""}
              </span>
              <span className="text-xs text-gray-600">{edu.year}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
