// Heuristic résumé parser: turns raw résumé text (from a PDF or TXT upload)
// into Kite's structured resume + profile contact fields. It won't be
// perfect for every layout — the editor is right there for touch-ups.
import { ResumeContent } from "./ats";

export type ParsedResume = {
  content: ResumeContent;
  contact: { name?: string; email?: string; phone?: string; linkedin?: string; location?: string };
};

const SECTION_HEADS: [RegExp, keyof SectionMap][] = [
  [/^(professional\s+)?summary$|^objective$|^about( me)?$|^profile$/i, "summary"],
  [/^(technical\s+|core\s+)?skills?( & .*)?$|^technologies$|^competencies$/i, "skills"],
  [/^(work\s+|professional\s+|relevant\s+)?experience$|^employment( history)?$|^career history$/i, "experience"],
  [/^education( & .*)?$|^academic.*$/i, "education"],
];

type SectionMap = { summary: string[]; skills: string[]; experience: string[]; education: string[]; other: string[] };

export function parseResumeText(raw: string): ParsedResume {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim());

  const contact: ParsedResume["contact"] = {};
  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) contact.email = email[0];
  const phone = raw.match(/(\+?\(?\d[\d ()-]{8,}\d)/);
  if (phone) contact.phone = phone[0].trim();
  const linkedin = raw.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedin) contact.linkedin = `https://www.${linkedin[0].replace(/^www\./i, "")}`;

  // Name: first non-empty line that isn't contact info.
  for (const l of lines.slice(0, 6)) {
    if (!l) continue;
    if (/@|\d{3}|linkedin|github|http/i.test(l)) continue;
    if (l.split(" ").length <= 5) contact.name = l;
    break;
  }

  // Split into sections.
  const sections: SectionMap = { summary: [], skills: [], experience: [], education: [], other: [] };
  let current: keyof SectionMap = "other";
  for (const l of lines) {
    if (!l) continue;
    const head = SECTION_HEADS.find(([re]) => re.test(l.replace(/[:：]$/, "")));
    if (head && l.length < 45) {
      current = head[1];
      continue;
    }
    sections[current].push(l);
  }

  const summary = sections.summary.join(" ").slice(0, 800);

  // Skills: split on commas/pipes/bullets; fall back to keywords in summary.
  const skillText = sections.skills.join(", ");
  const skills = [
    ...new Set(
      skillText
        .split(/[,•|·;•]/)
        .map((s) => s.replace(/^[A-Za-z &]+:/, "").trim())
        .filter((s) => s && s.length <= 40)
    ),
  ].slice(0, 40);

  // Experience: date-bearing lines start a role; bullets attach to it.
  // Company names on their own line (often ALL CAPS with a location, before
  // or after a role block) are captured and attached to the next role.
  const experience: NonNullable<ResumeContent["experience"]> = [];
  const dateRe = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4})\s*[–—-]\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4}|present|current)/i;
  let role: (typeof experience)[number] | null = null;
  let pendingCompany = "";
  const titleCase = (s: string) =>
    s.toLowerCase().replace(/(^|[\s(])[a-z]/g, (c) => c.toUpperCase());
  for (const l of sections.experience) {
    const isBullet = /^[•\-*▪●·]/.test(l);
    const hasDate = dateRe.test(l);
    const letters = l.replace(/[^a-zA-Z]/g, "");
    const capsRatio = letters.length ? letters.replace(/[a-z]/g, "").length / letters.length : 0;
    // Standalone company line: mostly caps, short, no date, no bullet.
    if (!isBullet && !hasDate && letters.length >= 4 && capsRatio > 0.7 && l.length < 60) {
      const withoutLoc = l.replace(/[.,]?\s+[A-Z][a-zA-Z]*,\s*[A-Z]{2}\.?$/, "");
      const companyName = titleCase(withoutLoc.replace(/[.,]\s*$/, "").trim());
      // The company line can come after the title line too — attach it to the
      // role we just started if that one is still missing a company.
      if (role && !role.company) role.company = companyName.slice(0, 60);
      else pendingCompany = companyName;
      continue;
    }
    if (!isBullet && (hasDate || (l.length < 90 && /[A-Z]/.test(l[0] ?? "") && !role))) {
      const dates = l.match(dateRe);
      const text = l.replace(dateRe, "").replace(/[|,·]\s*$/, "").trim();
      const [titlePart, companyPart] = text.split(/\s+[–—|@]\s+|,\s+(?=[A-Z])/);
      role = {
        title: (titlePart ?? text).slice(0, 80),
        company: (companyPart ?? pendingCompany).slice(0, 60),
        start: dates ? dates[1] : "",
        end: dates ? dates[3] : "",
        bullets: [],
      };
      pendingCompany = "";
      experience.push(role);
    } else if (role) {
      role.bullets.push(l.replace(/^[•\-*▪●·]\s*/, ""));
    }
  }

  // Education entries are usually 2–3 lines: school, degree, dates — in
  // either order. Group consecutive lines into one entry per school.
  const education: NonNullable<ResumeContent["education"]> = [];
  const schoolRe = /university|college|institute|school|academy|polytechnic/i;
  const degreeRe = /\b(b\.?\s?s|b\.?\s?a|m\.?\s?s|m\.?\s?a|m\.?b\.?a|ph\.?\s?d|bachelor|master|doctor|associate|diploma|certificate)\b/i;
  const rangeRe = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4})\s*[–—-]\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4}|present|expected[^,]*)/i;
  const yearRe = /\b(19|20)\d{2}\b/;

  let entry: (typeof education)[number] | null = null;
  const pushEntry = () => {
    if (entry && (entry.school || entry.degree)) education.push(entry);
    entry = null;
  };
  for (const raw of sections.education) {
    const l = raw.replace(/^[•\-*▪●·]\s*/, "").trim();
    if (!l) continue;
    const dates = l.match(rangeRe);
    const isSchool = schoolRe.test(l);
    const isDegree = degreeRe.test(l);

    if (isSchool) {
      // A new school line starts a new entry.
      if (entry?.school) pushEntry();
      entry = entry ?? { school: "", degree: "", year: "" };
      entry.school = l.replace(rangeRe, "").replace(/[|,·]\s*$/, "").trim().slice(0, 90);
    } else if (isDegree) {
      entry = entry ?? { school: "", degree: "", year: "" };
      // "Doctor of Business Administration · Business Intelligence"
      const text = l.replace(rangeRe, "").replace(/[|,·]\s*$/, "").trim();
      if (!entry.degree) entry.degree = text.slice(0, 90);
    } else if (dates || yearRe.test(l)) {
      entry = entry ?? { school: "", degree: "", year: "" };
    } else if (entry && !entry.degree && l.length < 70) {
      entry.degree = l.slice(0, 90);
    }

    if (entry) {
      if (dates) entry.year = `${dates[1]} – ${dates[3]}`.replace(/\s+/g, " ");
      else if (!entry.year && yearRe.test(l)) entry.year = (l.match(yearRe) as RegExpMatchArray)[0];
    }
  }
  pushEntry();

  // Split "B.S. Computer Science, State University" style single lines.
  for (const e of education) {
    if (!e.school && e.degree.includes(",")) {
      const [deg, ...school] = e.degree.split(",");
      e.degree = deg.trim();
      e.school = school.join(",").trim();
    }
  }

  return {
    content: {
      summary,
      skills,
      experience: experience.slice(0, 8),
      education: education.slice(0, 4),
    },
    contact,
  };
}
