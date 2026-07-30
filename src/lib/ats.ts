// ATS keyword engine: extract keywords from a job description, score a resume
// against them, and produce a tailoring report.

const STOPWORDS = new Set(
  `a об the and or of to in for with on at by an is are was were be been being as from that this these those it its
you your we our they their he she will would can could should may might must have has had do does did not no nor
about into over under out up down off then than so if but while during before after above below between each few
more most other some such only own same too very s t just don now all any both what which who whom when where why
how job role team work company position candidate candidates experience years year required requirements
responsibilities qualifications preferred plus benefits salary apply application equal opportunity employer
including include includes ability able strong excellent good great new using use used skills skill knowledge
familiarity understanding etc eg ie per across within without also well highly looking join us day days remote
onsite hybrid full time part contract location based offer offers competitive`.split(/\s+/)
);

// Multi-word tech/skill phrases recognized as single keywords.
const PHRASES = [
  "machine learning", "deep learning", "data science", "data engineering", "data analysis",
  "natural language processing", "computer vision", "software engineering", "web development",
  "front end", "back end", "full stack", "unit testing", "integration testing", "test automation",
  "continuous integration", "continuous delivery", "ci cd", "version control", "code review",
  "agile methodologies", "scrum master", "product management", "project management",
  "rest api", "rest apis", "graphql api", "micro services", "distributed systems",
  "cloud computing", "amazon web services", "google cloud", "google cloud platform",
  "react native", "next js", "node js", "vue js", "ruby on rails", "spring boot",
  "sql server", "power bi", "business intelligence", "customer success", "account management",
  "digital marketing", "content marketing", "social media", "search engine optimization",
  "user experience", "user interface", "ux design", "ui design", "design systems",
  "technical support", "quality assurance", "site reliability", "devops engineering",
  "object oriented", "functional programming", "event driven", "message queues",
  "state management", "responsive design", "cross functional", "stakeholder management",
];

const CANON: Record<string, string> = {
  "js": "javascript", "ts": "typescript", "reactjs": "react", "react.js": "react",
  "nodejs": "node js", "node.js": "node js", "nextjs": "next js", "next.js": "next js",
  "vuejs": "vue js", "vue.js": "vue js", "postgres": "postgresql", "k8s": "kubernetes",
  "aws": "amazon web services", "gcp": "google cloud platform", "ml": "machine learning",
  "ai": "artificial intelligence", "nlp": "natural language processing",
  "seo": "search engine optimization", "ci/cd": "ci cd", "oop": "object oriented",
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canon(word: string): string {
  return CANON[word] ?? word;
}

export type KeywordHit = { keyword: string; count: number };

export function extractKeywords(jobDescription: string, limit = 30): KeywordHit[] {
  const text = normalize(jobDescription);
  const counts = new Map<string, number>();

  for (const phrase of PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[+#.]/g, "\\$&")}\\b`, "g");
    const m = text.match(re);
    if (m) counts.set(phrase, m.length);
  }

  let stripped = text;
  for (const phrase of counts.keys()) {
    stripped = stripped.split(phrase).join(" ");
  }

  for (const raw of stripped.split(" ")) {
    const w = canon(raw.replace(/^[./-]+|[./-]+$/g, ""));
    if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([kw, c]) => c >= 2 || PHRASES.includes(kw))
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type AtsReport = {
  score: number;
  matched: KeywordHit[];
  missing: KeywordHit[];
};

export function scoreResume(resumeText: string, jobDescription: string): AtsReport {
  const keywords = extractKeywords(jobDescription);
  const resume = " " + normalize(resumeText) + " ";
  const matched: KeywordHit[] = [];
  const missing: KeywordHit[] = [];

  for (const kw of keywords) {
    if (resume.includes(` ${kw.keyword} `) || resume.includes(kw.keyword)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const totalWeight = keywords.reduce((s, k) => s + k.count, 0) || 1;
  const matchedWeight = matched.reduce((s, k) => s + k.count, 0);
  const score = Math.round((matchedWeight / totalWeight) * 100);
  return { score, matched, missing };
}

export type ResumeContent = {
  summary?: string;
  skills?: string[];
  experience?: {
    title: string;
    company: string;
    start?: string;
    end?: string;
    bullets: string[];
  }[];
  education?: { school: string; degree: string; year?: string }[];
};

export function resumeToText(content: ResumeContent): string {
  const parts: string[] = [];
  if (content.summary) parts.push(content.summary);
  if (content.skills?.length) parts.push(content.skills.join(" "));
  for (const exp of content.experience ?? []) {
    parts.push(`${exp.title} ${exp.company}`);
    parts.push(exp.bullets.join(" "));
  }
  for (const edu of content.education ?? []) {
    parts.push(`${edu.degree} ${edu.school}`);
  }
  return parts.join("\n");
}

// Tailoring: reorder skills so JD-matched ones come first, surface missing
// keywords the user actually has evidence for, and rank experience bullets.
export function tailorResume(
  content: ResumeContent,
  jobDescription: string
): { tailored: ResumeContent; report: AtsReport } {
  const keywords = extractKeywords(jobDescription);
  const kwSet = keywords.map((k) => k.keyword);

  const tailored: ResumeContent = JSON.parse(JSON.stringify(content));

  if (tailored.skills?.length) {
    tailored.skills.sort((a, b) => {
      const ai = kwSet.findIndex((k) => a.toLowerCase().includes(k) || k.includes(a.toLowerCase()));
      const bi = kwSet.findIndex((k) => b.toLowerCase().includes(k) || k.includes(b.toLowerCase()));
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  for (const exp of tailored.experience ?? []) {
    exp.bullets.sort((a, b) => bulletScore(b, kwSet) - bulletScore(a, kwSet));
  }

  const report = scoreResume(resumeToText(tailored), jobDescription);
  return { tailored, report };
}

function bulletScore(bullet: string, keywords: string[]): number {
  const b = bullet.toLowerCase();
  return keywords.reduce((s, k) => (b.includes(k) ? s + 1 : s), 0);
}

// Human-readable list of what tailoring changed, shown for approval before send.
export type ResumeDiff = {
  section: string;
  change: string;
}[];

export function diffResume(original: ResumeContent, tailored: ResumeContent, jobDescription: string): ResumeDiff {
  const diff: ResumeDiff = [];
  const kws = extractKeywords(jobDescription, 25).map((k) => k.keyword);

  const origSkills = original.skills ?? [];
  const newSkills = tailored.skills ?? [];
  const promoted = newSkills
    .slice(0, 5)
    .filter((s, i) => origSkills.indexOf(s) > i)
    .filter((s) => kws.some((k) => s.toLowerCase().includes(k) || k.includes(s.toLowerCase())));
  if (promoted.length) {
    diff.push({
      section: "Skills",
      change: `Moved ${promoted.join(", ")} to the front — the posting screens for ${promoted.length > 1 ? "these" : "this"}`,
    });
  }

  (tailored.experience ?? []).forEach((exp, i) => {
    const origExp = (original.experience ?? [])[i];
    if (!origExp) return;
    const newLead = exp.bullets[0];
    if (newLead && origExp.bullets[0] !== newLead) {
      const hit = kws.find((k) => newLead.toLowerCase().includes(k));
      diff.push({
        section: `${exp.title} @ ${exp.company}`,
        change: `Now leads with "${newLead.slice(0, 70)}${newLead.length > 70 ? "…" : ""}"${hit ? ` (mentions ${hit})` : ""}`,
      });
    }
  });

  if (diff.length === 0) {
    diff.push({ section: "Résumé", change: "Already well-aligned — no reordering needed" });
  }
  return diff;
}
