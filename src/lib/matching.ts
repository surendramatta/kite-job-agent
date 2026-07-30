import { getDb, getSetting, Job, Resume } from "./db";
import {
  extractKeywords,
  resumeToText,
  ResumeContent,
} from "./ats";

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

export type MatchResult = {
  score: number;
  reasons: string[];
  cautions: string[];
};

export function getPreferences(): Preferences {
  return {
    roles: splitList(getSetting("pref_roles")),
    locations: splitList(getSetting("pref_locations")),
    remoteOnly: getSetting("pref_remote_only", "0") === "1",
    salaryMin: parseInt(getSetting("pref_salary_min", "0"), 10) || 0,
    experienceLevel: getSetting("pref_experience", ""),
    workAuth: getSetting("pref_work_auth", ""),
    needsSponsorship:
      getSetting("pref_needs_sponsorship", "0") === "1",
    excludeKeywords: splitList(getSetting("pref_exclude_keywords")),
    excludeCompanies: splitList(getSetting("pref_exclude_companies")),
    dailyLimit:
      parseInt(getSetting("aa_daily_limit", "25"), 10) || 25,
    minMatchScore:
      parseInt(getSetting("pref_min_match", "50"), 10) || 50,
    usaOnly: getSetting("pref_usa_only", "1") !== "0",
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function titleSimilarity(candidateTitle: string, jobTitle: string): number {
  const candidate = new Set(tokens(candidateTitle));
  const job = new Set(tokens(jobTitle));

  if (!candidate.size || !job.size) return 0;

  let overlap = 0;
  for (const token of candidate) {
    if (job.has(token)) overlap++;
  }

  return overlap / Math.max(candidate.size, job.size);
}

function resumeTitles(resume: ResumeContent | null): string[] {
  return (resume?.experience ?? [])
    .map((experience) => experience.title)
    .filter(Boolean);
}

function estimateExperienceYears(
  resume: ResumeContent | null
): number {
  const periods = (resume?.experience ?? [])
    .map((experience) => {
      const start = parseYear(experience.start);
      const end =
        /present|current/i.test(experience.end ?? "")
          ? new Date().getFullYear()
          : parseYear(experience.end);

      if (!start || !end || end < start) return 0;
      return Math.min(end - start + 1, 10);
    })
    .filter((years) => years > 0);

  if (!periods.length) {
    return Math.min((resume?.experience ?? []).length * 1.5, 10);
  }

  return Math.min(
    periods.reduce((total, years) => total + years, 0),
    15
  );
}

function parseYear(value?: string): number {
  const match = value?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
}

function requiredExperienceYears(description: string): number {
  const matches = [
    ...description.matchAll(
      /(\d+)\s*(?:\+|plus)?\s*(?:-|to)?\s*\d*\s*years?(?:\s+of)?\s+(?:professional\s+)?experience/gi
    ),
  ];

  if (!matches.length) return 0;

  return Math.max(
    ...matches.map((match) => Number(match[1]) || 0)
  );
}

function seniorityLevel(text: string): number {
  const value = normalize(text);

  if (
    /\b(principal|staff|director|head|vice president|vp)\b/.test(
      value
    )
  ) {
    return 5;
  }

  if (/\b(senior|sr|lead|manager)\b/.test(value)) return 4;
  if (/\b(mid|intermediate|level ii|level 2)\b/.test(value)) return 3;
  if (
    /\b(junior|jr|entry|associate|level i|level 1|graduate)\b/.test(
      value
    )
  ) {
    return 1;
  }

  return 2;
}

function extractRequiredKeywords(description: string): string[] {
  const requiredSections = description
    .split(/\n|[.!?]\s+/)
    .filter((sentence) =>
      /\b(required|requirements|must have|must possess|minimum qualifications|you have|we need)\b/i.test(
        sentence
      )
    )
    .join(" ");

  const source = requiredSections || description;

  return extractKeywords(source, 20).map(
    (keyword) => keyword.keyword
  );
}

function hasKeyword(text: string, keyword: string): boolean {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedKeyword = normalize(keyword);

  return (
    normalizedText.includes(` ${normalizedKeyword} `) ||
    normalizedText.includes(normalizedKeyword)
  );
}

function salaryMaximum(salary: string): number {
  const numbers = (
    salary.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  ).map((value) =>
    Number(value.replace(/,/g, ""))
  );

  if (!numbers.length) return 0;

  let maximum = Math.max(...numbers);

  if (
    /\b\d+(?:\.\d+)?k\b/i.test(salary) ||
    (maximum < 1000 && /\bannual|year|salary\b/i.test(salary))
  ) {
    maximum *= 1000;
  }

  return maximum;
}

export function computeMatch(
  job: Job,
  resume: ResumeContent | null,
  prefs: Preferences
): MatchResult {
  const reasons: string[] = [];
  const cautions: string[] = [];

  if (!resume) {
    return {
      score: 0,
      reasons: [],
      cautions: ["Upload a résumé before ranking this job"],
    };
  }

  const resumeText = resumeToText(resume);
  const jobText = `${job.title}\n${job.description}\n${job.tags_json}`;
  const candidateTitles = [
    ...prefs.roles,
    ...resumeTitles(resume),
  ];

  let score = 0;

  // 1. Job-title and role-family fit: 25 points
  const titleScores = candidateTitles.map((title) =>
    titleSimilarity(title, job.title)
  );
  const bestTitleScore = titleScores.length
    ? Math.max(...titleScores)
    : 0;

  if (bestTitleScore >= 0.65) {
    score += 25;
    reasons.push("Strong match with your target job titles");
  } else if (bestTitleScore >= 0.35) {
    score += 15;
    reasons.push("Related to your target role family");
  } else if (
    candidateTitles.some((title) =>
      normalize(job.title).includes(normalize(title))
    )
  ) {
    score += 18;
    reasons.push("Job title contains one of your target roles");
  } else {
    cautions.push("Job title is outside your strongest role family");
  }

  // 2. Required-skill coverage: 35 points
  const requiredKeywords =
    extractRequiredKeywords(job.description);
  const matchedRequired = requiredKeywords.filter((keyword) =>
    hasKeyword(resumeText, keyword)
  );
  const missingRequired = requiredKeywords.filter(
    (keyword) => !hasKeyword(resumeText, keyword)
  );

  const requiredCoverage = requiredKeywords.length
    ? matchedRequired.length / requiredKeywords.length
    : 0;

  score += Math.round(requiredCoverage * 35);

  if (matchedRequired.length) {
    reasons.push(
      `${matchedRequired.length}/${requiredKeywords.length} key requirements matched: ${matchedRequired
        .slice(0, 5)
        .join(", ")}`
    );
  }

  if (missingRequired.length) {
    cautions.push(
      `Missing or unproven requirements: ${missingRequired
        .slice(0, 5)
        .join(", ")}`
    );
  }

  // Strong penalty when most requirements are absent.
  if (
    requiredKeywords.length >= 5 &&
    requiredCoverage < 0.35
  ) {
    score -= 18;
    cautions.push("Low coverage of the posting's core requirements");
  }

  // 3. Overall skill similarity: 15 points
  const overallKeywords = extractKeywords(job.description, 30);
  const overallMatched = overallKeywords.filter((keyword) =>
    hasKeyword(resumeText, keyword.keyword)
  );

  const overallCoverage = overallKeywords.length
    ? overallMatched.length / overallKeywords.length
    : 0;

  score += Math.round(overallCoverage * 15);

  if (overallCoverage >= 0.6) {
    reasons.push("Strong overall résumé-to-description alignment");
  }

  // 4. Years-of-experience fit: 10 points
  const candidateYears = estimateExperienceYears(resume);
  const requiredYears = requiredExperienceYears(job.description);

  if (!requiredYears) {
    score += 6;
  } else if (candidateYears >= requiredYears) {
    score += 10;
    reasons.push(
      `Experience aligns: approximately ${candidateYears} years versus ${requiredYears}+ required`
    );
  } else if (candidateYears + 1 >= requiredYears) {
    score += 5;
    cautions.push(
      `Slight experience gap: approximately ${candidateYears} years versus ${requiredYears}+ required`
    );
  } else {
    score -= 15;
    cautions.push(
      `Experience gap: approximately ${candidateYears} years versus ${requiredYears}+ required`
    );
  }

  // 5. Seniority fit: 5 points
  const candidateSeniority = Math.max(
    1,
    ...candidateTitles.map(seniorityLevel)
  );
  const jobSeniority = seniorityLevel(job.title);

  if (jobSeniority <= candidateSeniority + 1) {
    score += 5;
  } else {
    score -= 12;
    cautions.push("The role appears above your current seniority level");
  }

  // 6. Location and remote fit: 5 points
  const location = normalize(job.location);

  if (job.remote) {
    score += 5;
    reasons.push("Remote-friendly");
  } else if (prefs.remoteOnly) {
    score -= 10;
    cautions.push("This is not a remote role");
  } else if (
    !prefs.locations.length ||
    prefs.locations.some((preferred) =>
      location.includes(normalize(preferred))
    )
  ) {
    score += 5;
    if (job.location) {
      reasons.push(`Location fits: ${job.location}`);
    }
  } else {
    score -= 5;
    cautions.push(
      `Location does not match your preferences: ${
        job.location || "not provided"
      }`
    );
  }

  // 7. Work authorization and sponsorship: 5 points
  const noSponsorship =
    /\b(no|not|unable to|cannot|can't)\s+(?:provide\s+)?(?:visa\s+)?sponsorship\b/i.test(
      job.description
    ) ||
    /\bmust not require sponsorship\b/i.test(job.description);

  if (prefs.needsSponsorship && noSponsorship) {
    score -= 20;
    cautions.push("The posting states that sponsorship is unavailable");
  } else {
    score += 5;
  }

  // Salary is a filter and caution, not a relevance booster.
  const maximumSalary = salaryMaximum(job.salary);

  if (
    prefs.salaryMin > 0 &&
    maximumSalary > 0 &&
    maximumSalary < prefs.salaryMin
  ) {
    score -= 8;
    cautions.push(
      `${job.salary} is below your minimum compensation`
    );
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  if (finalScore >= 80) {
    reasons.unshift("Excellent résumé match");
  } else if (finalScore >= 65) {
    reasons.unshift("Strong résumé match");
  } else if (finalScore < 45) {
    cautions.unshift("Low-confidence match");
  }

  return {
    score: finalScore,
    reasons,
    cautions,
  };
}

const NON_US =
  /\b(germany|india|united kingdom|uk|london|berlin|paris|france|spain|poland|brazil|canada|toronto|australia|singapore|netherlands|amsterdam|ireland|dublin|portugal|romania|ukraine|mexico|argentina|japan|china|philippines|nigeria|kenya|emea|apac|latam)\b/i;

const US_HINT =
  /\b(united states|usa|u\.s\.|us only|remote \(us|,\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b)/i;

export function isUsJob(job: Job): boolean {
  const location = `${job.location} ${job.title}`;

  if (US_HINT.test(location)) return true;
  if (NON_US.test(location)) return false;

  return job.remote === 1 || location.trim() === "";
}

export function isExcluded(
  job: Job,
  prefs: Preferences
): boolean {
  if (prefs.usaOnly && !isUsJob(job)) return true;

  const text =
    `${job.title} ${job.company} ${job.tags_json}`.toLowerCase();

  if (
    prefs.excludeCompanies.some((company) =>
      job.company.toLowerCase().includes(company)
    )
  ) {
    return true;
  }

  if (
    prefs.excludeKeywords.some((keyword) =>
      text.includes(keyword)
    )
  ) {
    return true;
  }

  return false;
}

export function getDefaultResumeContent(): ResumeContent | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM resumes WHERE is_default = 1"
    )
    .get() as Resume | undefined;

  return row
    ? (JSON.parse(row.content_json) as ResumeContent)
    : null;
}

export function appliedTodayCount(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n
       FROM applications
       WHERE applied_at >= datetime('now', 'start of day')`
    )
    .get() as { n: number };

  return row.n;
}
