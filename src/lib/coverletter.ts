import { getSetting, Job, Profile } from "./db";
import { extractKeywords, ResumeContent } from "./ats";

export function generateCoverLetterLocal(
  job: Job,
  profile: Profile,
  resume: ResumeContent
): string {
  const keywords = extractKeywords(job.description, 8).map((k) => k.keyword);
  const skills = (resume.skills ?? []).slice(0, 6);
  const matchedSkills = skills.filter((s) =>
    keywords.some((k) => s.toLowerCase().includes(k) || k.includes(s.toLowerCase()))
  );
  const topExp = resume.experience?.[0];

  const lines: string[] = [];
  lines.push(`Dear ${job.company} Hiring Team,`);
  lines.push("");
  lines.push(
    `I'm writing to apply for the ${job.title} position at ${job.company}. ` +
      (profile.headline
        ? `As a ${profile.headline}, I believe my background aligns closely with what you're looking for.`
        : `My background aligns closely with what you're looking for.`)
  );
  lines.push("");
  if (topExp) {
    lines.push(
      `Most recently at ${topExp.company} as ${topExp.title}, ${firstBulletSentence(topExp.bullets)} ` +
        (matchedSkills.length
          ? `My experience with ${humanList(matchedSkills)} maps directly onto the requirements in your posting.`
          : `I have consistently delivered results in fast-moving environments.`)
    );
    lines.push("");
  }
  if (keywords.length) {
    lines.push(
      `Your posting emphasizes ${humanList(keywords.slice(0, 4))} — areas where I have hands-on, production experience and can contribute from day one.`
    );
    lines.push("");
  }
  lines.push(
    `I'd welcome the chance to discuss how I can contribute to ${job.company}. Thank you for your time and consideration.`
  );
  lines.push("");
  lines.push("Sincerely,");
  lines.push(profile.full_name || "");
  return lines.join("\n");
}

function firstBulletSentence(bullets: string[]): string {
  const b = bullets[0] ?? "I led high-impact work across the stack.";
  const s = b.trim().replace(/^[-•]\s*/, "");
  const lower = s.charAt(0).toLowerCase() + s.slice(1);
  return lower.endsWith(".") ? lower : lower + ".";
}

function humanList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// Optional higher-quality generation via the Claude API when the user has
// saved an API key in Settings. Falls back to the local template otherwise.
export async function generateCoverLetter(
  job: Job,
  profile: Profile,
  resume: ResumeContent
): Promise<{ text: string; engine: "claude" | "local" }> {
  const apiKey = getSetting("anthropic_api_key");
  if (!apiKey) return { text: generateCoverLetterLocal(job, profile, resume), engine: "local" };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `Write a concise, specific, professional cover letter (under 250 words, no placeholders, plain text) for this job application.

JOB: ${job.title} at ${job.company}
DESCRIPTION (truncated): ${job.description.slice(0, 3000)}

CANDIDATE: ${profile.full_name}, ${profile.headline}
SUMMARY: ${resume.summary ?? profile.summary}
SKILLS: ${(resume.skills ?? []).join(", ")}
RECENT EXPERIENCE: ${JSON.stringify(resume.experience?.slice(0, 2) ?? [])}
${getSetting("tsenta_rules") ? `STANDING RULES FROM THE CANDIDATE (always honor):\n${getSetting("tsenta_rules")}` : ""}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Claude API HTTP ${res.status}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = data.content.find((c) => c.type === "text")?.text?.trim();
    if (!text) throw new Error("empty response");
    return { text, engine: "claude" };
  } catch {
    return { text: generateCoverLetterLocal(job, profile, resume), engine: "local" };
  }
}
