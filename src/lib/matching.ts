import { getDb, getSetting, Job, Resume } from "./db";
import { extractKeywords, resumeToText, ResumeContent } from "./ats";

export type Preferences = {
  roles: string[];
  locations: string[];
  remoteOnly: boolean;
  salaryMin: number;
  experienceLevel: string;
  workAuth: string;
  needsSponsorship: boolean;
  excludeKeywords: string[];
  excludeCompanies: string[];
  dailyLimit: number;
  minMatchScore: number;
  usaOnly: boolean;
};

export function getPreferences(): Preferences {
  return {
    roles: splitList(getSetting("pref_roles")),
    locations: splitList(getSetting("pref_locations")),
    remoteOnly: getSetting("pref_remote_only", "0") === "1",
    salaryMin: parseInt(getSetting("pref_salary_min", "0"), 10) || 0,
    experienceLevel: getSetting("pref_experience", ""),
    workAuth: getSetting("pref_work_auth", ""),
    needsSponsorship: getSetting("pref_needs_sponsorship", "0") === "1",
    excludeKeywords: splitList(getSetting("pref_exclude_keywords")),
    excludeCompanies: splitList(getSetting("pref_exclude_companies")),
    dailyLimit: parseInt(getSetting("aa_daily_limit", "25"), 10) || 25,
    minMatchScore: parseInt(getSetting("pref_min_match", "50"), 10) || 50,
    usaOnly: getSetting("pref_usa_only", "1") !== "0",
  };
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export type MatchResult = {
  score: number;
  reasons: string[];
  cautions: string[];
};

// Tsenta-style match: skills vs the JD plus preference fit (role family,
// location/remote, salary, seniority), with a human-readable breakdown.
export function computeMatch(job: Job, resume: ResumeContent | null, prefs: Preferences): MatchResult {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const hay = `${job.title} ${job.tags_json} ${job.description.slice(0, 400)}`.toLowerCase();

  // Skills overlap: 60 points
  let skillPoints = 0;
  if (resume) {
    const keywords = extractKeywords(job.description, 25);
    const resumeText = " " + resumeToText(resume).toLowerCase() + " ";
    const matched = keywords.filter((k) => resumeText.includes(k.keyword));
    const totalWeight = keywords.reduce((s, k) => s + k.count, 0) || 1;
    const matchedWeight = matched.reduce((s, k) => s + k.count, 0);
    skillPoints = Math.round((matchedWeight / totalWeight) * 60);
    if (matched.length > 0) {
      const top = matched.slice(0, 3).map((k) => k.keyword);
      reasons.push(
        `Skills match: ${top.join(", ")}${matched.length > 3 ? ` +${matched.length - 3} more` : ""}`
      );
    } else {
      cautions.push("Few of the posting's keywords appear on your résumé");
    }
  } else {
    skillPoints = 30;
    cautions.push("Add a résumé to get a real skills match");
  }

  // Role family: 15 points
  let rolePoints = 0;
  if (prefs.roles.length === 0) {
    rolePoints = 8;
  } else if (prefs.roles.some((r) => hay.includes(r))) {
    rolePoints = 15;
    reasons.push(`Role matches your target: ${prefs.roles.find((r) => hay.includes(r))}`);
  } else {
    cautions.push("Outside your target role family");
  }

  // Location / remote: 15 points
  let locPoints = 0;
  const jobLoc = job.location.toLowerCase();
  if (job.remote) {
    locPoints = 15;
    reasons.push("Remote-friendly");
  } else if (prefs.remoteOnly) {
    cautions.push("On-site, but you prefer remote");
  } else if (prefs.locations.length === 0 || prefs.locations.some((l) => jobLoc.includes(l))) {
    locPoints = prefs.locations.length ? 15 : 10;
    if (prefs.locations.length) reasons.push(`Location fits: ${job.location}`);
  } else {
    cautions.push(`Location is ${job.location || "unspecified"}`);
  }

  // Salary: 10 points
  let salPoints = 5;
  const salNums = (job.salary.match(/\d[\d,]*/g) ?? []).map((n) => parseInt(n.replace(/,/g, ""), 10));
  const salMax = salNums.length ? Math.max(...salNums) * (job.salary.includes("k") ? 1000 : 1) : 0;
  if (prefs.salaryMin > 0 && salMax > 0) {
    if (salMax >= prefs.salaryMin) {
      salPoints = 10;
      reasons.push(`Salary ${job.salary} meets your minimum`);
    } else {
      salPoints = 0;
      cautions.push(`Salary ${job.salary} is below your minimum`);
    }
  }

  // Sponsorship signal (informational only)
  if (prefs.needsSponsorship && /no sponsorship|unable to sponsor|not sponsor/i.test(job.description)) {
    cautions.push("Posting says the company does not sponsor visas");
  }

  const score = Math.max(5, Math.min(98, skillPoints + rolePoints + locPoints + salPoints));
  return { score, reasons, cautions };
}

const NON_US = /\b(germany|india|united kingdom|uk|london|berlin|paris|france|spain|poland|brazil|canada|toronto|australia|singapore|netherlands|amsterdam|ireland|dublin|portugal|romania|ukraine|mexico|argentina|japan|china|philippines|nigeria|kenya|emea|apac|latam)\b/i;
const US_HINT = /\b(united states|usa|u\.s\.|us only|remote \(us|,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b)/i;

// Keep the feed to US-based roles when the user wants that.
export function isUsJob(job: Job): boolean {
  const loc = `${job.location} ${job.title}`;
  if (US_HINT.test(loc)) return true;
  if (NON_US.test(loc)) return false;
  // Remote with no country signal: treat worldwide remote as acceptable.
  return job.remote === 1 || loc.trim() === "";
}

export function isExcluded(job: Job, prefs: Preferences): boolean {
  if (prefs.usaOnly && !isUsJob(job)) return true;
  const hay = `${job.title} ${job.company} ${job.tags_json}`.toLowerCase();
  if (prefs.excludeCompanies.some((c) => job.company.toLowerCase().includes(c))) return true;
  if (prefs.excludeKeywords.some((k) => hay.includes(k))) return true;
  return false;
}

export function getDefaultResumeContent(): ResumeContent | null {
  const row = getDb().prepare("SELECT * FROM resumes WHERE is_default = 1").get() as
    | Resume
    | undefined;
  return row ? (JSON.parse(row.content_json) as ResumeContent) : null;
}

export function appliedTodayCount(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM applications WHERE applied_at >= datetime('now', 'start of day')`
    )
    .get() as { n: number };
  return row.n;
}
