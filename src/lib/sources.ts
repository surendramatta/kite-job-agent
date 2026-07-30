import { getDb } from "./db";

export type FetchedJob = {
  source: string;
  external_id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string;
  job_type: string;
  tags: string[];
  description: string;
  url: string;
  posted_at: string | null;
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "tsenta-personal-dashboard" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

export async function fetchRemotive(search: string): Promise<FetchedJob[]> {
  const q = search ? `?search=${encodeURIComponent(search)}&limit=50` : "?limit=50";
  const data = (await fetchJson(`https://remotive.com/api/remote-jobs${q}`)) as {
    jobs: Record<string, unknown>[];
  };
  return (data.jobs ?? []).map((j) => ({
    source: "remotive",
    external_id: String(j.id),
    title: String(j.title ?? ""),
    company: String(j.company_name ?? ""),
    location: String(j.candidate_required_location ?? "Remote"),
    remote: true,
    salary: String(j.salary ?? ""),
    job_type: String(j.job_type ?? ""),
    tags: Array.isArray(j.tags) ? j.tags.map(String) : [],
    description: stripHtml(String(j.description ?? "")),
    url: String(j.url ?? ""),
    posted_at: j.publication_date ? String(j.publication_date) : null,
  }));
}

export async function fetchArbeitnow(): Promise<FetchedJob[]> {
  const data = (await fetchJson("https://www.arbeitnow.com/api/job-board-api")) as {
    data: Record<string, unknown>[];
  };
  return (data.data ?? []).map((j) => ({
    source: "arbeitnow",
    external_id: String(j.slug),
    title: String(j.title ?? ""),
    company: String(j.company_name ?? ""),
    location: String(j.location ?? ""),
    remote: Boolean(j.remote),
    salary: "",
    job_type: Array.isArray(j.job_types) ? j.job_types.map(String).join(", ") : "",
    tags: Array.isArray(j.tags) ? j.tags.map(String) : [],
    description: stripHtml(String(j.description ?? "")),
    url: String(j.url ?? ""),
    posted_at: j.created_at ? new Date(Number(j.created_at) * 1000).toISOString() : null,
  }));
}

export async function fetchRemoteOk(): Promise<FetchedJob[]> {
  const data = (await fetchJson("https://remoteok.com/api")) as Record<string, unknown>[];
  return data
    .filter((j) => j && typeof j === "object" && "id" in j)
    .map((j) => ({
      source: "remoteok",
      external_id: String(j.id),
      title: String(j.position ?? ""),
      company: String(j.company ?? ""),
      location: String(j.location ?? "Remote"),
      remote: true,
      salary:
        j.salary_min && j.salary_max
          ? `$${Number(j.salary_min) / 1000}k–$${Number(j.salary_max) / 1000}k`
          : "",
      job_type: "",
      tags: Array.isArray(j.tags) ? j.tags.map(String) : [],
      description: stripHtml(String(j.description ?? "")),
      url: String(j.url ?? ""),
      posted_at: j.date ? String(j.date) : null,
    }));
}

// Direct-ATS watchlists: fetch live postings straight from Greenhouse and
// Lever public APIs for companies the user watches. These are the postings
// the Kite agent can genuinely auto-submit.
export async function fetchGreenhouseBoard(slug: string): Promise<FetchedJob[]> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`
  )) as { jobs: Record<string, unknown>[] };
  return (data.jobs ?? []).map((j) => ({
    source: `greenhouse:${slug}`,
    external_id: String(j.id),
    title: String(j.title ?? ""),
    company: slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    location: String((j.location as { name?: string })?.name ?? ""),
    remote: /remote/i.test(String((j.location as { name?: string })?.name ?? "")),
    salary: "",
    job_type: "",
    tags: (Array.isArray(j.departments) ? (j.departments as { name: string }[]).map((d) => d.name) : []),
    description: stripHtml(String(j.content ?? "")),
    url: String(j.absolute_url ?? ""),
    posted_at: j.updated_at ? String(j.updated_at) : null,
  }));
}

export async function fetchLeverBoard(slug: string): Promise<FetchedJob[]> {
  const data = (await fetchJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`
  )) as Record<string, unknown>[];
  return (Array.isArray(data) ? data : []).map((j) => ({
    source: `lever:${slug}`,
    external_id: String(j.id),
    title: String(j.text ?? ""),
    company: slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    location: String((j.categories as { location?: string })?.location ?? ""),
    remote: /remote/i.test(JSON.stringify(j.categories ?? {})),
    salary: "",
    job_type: String((j.categories as { commitment?: string })?.commitment ?? ""),
    tags: [String((j.categories as { team?: string })?.team ?? "")].filter(Boolean),
    description: stripHtml(String(j.descriptionPlain ?? j.description ?? "")),
    url: String(j.hostedUrl ?? ""),
    posted_at: j.createdAt ? new Date(Number(j.createdAt)).toISOString() : null,
  }));
}

export async function fetchJobicy(): Promise<FetchedJob[]> {
  const data = (await fetchJson("https://jobicy.com/api/v2/remote-jobs?count=50")) as {
    jobs: Record<string, unknown>[];
  };
  return (data.jobs ?? []).map((j) => ({
    source: "jobicy",
    external_id: String(j.id),
    title: String(j.jobTitle ?? ""),
    company: String(j.companyName ?? ""),
    location: String(j.jobGeo ?? "Remote"),
    remote: true,
    salary: j.annualSalaryMin ? `$${j.annualSalaryMin}–$${j.annualSalaryMax}` : "",
    job_type: Array.isArray(j.jobType) ? j.jobType.map(String).join(", ") : "",
    tags: Array.isArray(j.jobIndustry) ? j.jobIndustry.map(String) : [],
    description: stripHtml(String(j.jobDescription ?? "")),
    url: String(j.url ?? ""),
    posted_at: j.pubDate ? String(j.pubDate) : null,
  }));
}

export async function fetchHimalayas(): Promise<FetchedJob[]> {
  const data = (await fetchJson("https://himalayas.app/jobs/api?limit=50")) as {
    jobs: Record<string, unknown>[];
  };
  return (data.jobs ?? []).map((j) => ({
    source: "himalayas",
    external_id: String(j.guid ?? j.applicationLink ?? j.title),
    title: String(j.title ?? ""),
    company: String(j.companyName ?? ""),
    location: Array.isArray(j.locationRestrictions) ? j.locationRestrictions.map(String).join(", ") : "Remote",
    remote: true,
    salary: j.minSalary ? `$${j.minSalary}–$${j.maxSalary}` : "",
    job_type: String(j.employmentType ?? ""),
    tags: Array.isArray(j.categories) ? j.categories.map(String) : [],
    description: stripHtml(String(j.description ?? "")),
    url: String(j.applicationLink ?? ""),
    posted_at: j.pubDate ? new Date(Number(j.pubDate) * 1000).toISOString() : null,
  }));
}

export async function fetchTheMuse(): Promise<FetchedJob[]> {
  const data = (await fetchJson("https://www.themuse.com/api/public/jobs?page=1")) as {
    results: Record<string, unknown>[];
  };
  return (data.results ?? []).map((j) => ({
    source: "themuse",
    external_id: String(j.id),
    title: String(j.name ?? ""),
    company: String((j.company as { name?: string })?.name ?? ""),
    location: (Array.isArray(j.locations) ? (j.locations as { name: string }[]).map((l) => l.name) : []).join(", "),
    remote: /remote|flexible/i.test(JSON.stringify(j.locations ?? [])),
    salary: "",
    job_type: (Array.isArray(j.levels) ? (j.levels as { name: string }[]).map((l) => l.name) : []).join(", "),
    tags: (Array.isArray(j.categories) ? (j.categories as { name: string }[]).map((c) => c.name) : []),
    description: stripHtml(String(j.contents ?? "")),
    url: String((j.refs as { landing_page?: string })?.landing_page ?? ""),
    posted_at: j.publication_date ? String(j.publication_date) : null,
  }));
}

// Adzuna covers millions of postings incl. local on-site jobs; free API key
// from developer.adzuna.com, entered in Controls.
export async function fetchAdzuna(appId: string, appKey: string, what: string, where: string): Promise<FetchedJob[]> {
  const q = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "50",
    max_days_old: "7",
    ...(what ? { what } : {}),
    ...(where ? { where } : {}),
  });
  const data = (await fetchJson(`https://api.adzuna.com/v1/api/jobs/us/search/1?${q}`)) as {
    results: Record<string, unknown>[];
  };
  return (data.results ?? []).map((j) => ({
    source: "adzuna",
    external_id: String(j.id),
    title: String(j.title ?? "").replace(/<[^>]+>/g, ""),
    company: String((j.company as { display_name?: string })?.display_name ?? ""),
    location: String((j.location as { display_name?: string })?.display_name ?? ""),
    remote: /remote/i.test(String(j.title) + String(j.description)),
    salary: j.salary_min ? `$${Math.round(Number(j.salary_min) / 1000)}k–$${Math.round(Number(j.salary_max) / 1000)}k` : "",
    job_type: String(j.contract_time ?? ""),
    tags: [String((j.category as { label?: string })?.label ?? "")].filter(Boolean),
    description: stripHtml(String(j.description ?? "")),
    url: String(j.redirect_url ?? ""),
    posted_at: j.created ? String(j.created) : null,
  }));
}


// ---- More direct ATS boards: the fastest path to a posting, usually live
// hours-to-days before it is syndicated to LinkedIn/Indeed. ----

export async function fetchAshbyBoard(slug: string): Promise<FetchedJob[]> {
  const data = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`
  )) as { jobs: Record<string, unknown>[] };
  return (data.jobs ?? []).map((j) => ({
    source: `ashby:${slug}`,
    external_id: String(j.id),
    title: String(j.title ?? ""),
    company: slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    location: String(j.location ?? ""),
    remote: Boolean(j.isRemote),
    salary: String((j.compensation as { compensationTierSummary?: string })?.compensationTierSummary ?? ""),
    job_type: String(j.employmentType ?? ""),
    tags: [String(j.department ?? ""), String(j.team ?? "")].filter(Boolean),
    description: stripHtml(String(j.descriptionHtml ?? j.descriptionPlain ?? "")),
    url: String(j.jobUrl ?? j.applyUrl ?? ""),
    posted_at: j.publishedAt ? String(j.publishedAt) : null,
  }));
}

export async function fetchSmartRecruitersBoard(slug: string): Promise<FetchedJob[]> {
  const data = (await fetchJson(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=100`
  )) as { content: Record<string, unknown>[] };
  return (data.content ?? []).map((j) => {
    const loc = j.location as { city?: string; country?: string; remote?: boolean } | undefined;
    return {
      source: `smartrecruiters:${slug}`,
      external_id: String(j.id),
      title: String(j.name ?? ""),
      company: String((j.company as { name?: string })?.name ?? slug),
      location: [loc?.city, loc?.country].filter(Boolean).join(", "),
      remote: Boolean(loc?.remote),
      salary: "",
      job_type: String((j.typeOfEmployment as { label?: string })?.label ?? ""),
      tags: [String((j.department as { label?: string })?.label ?? "")].filter(Boolean),
      description: stripHtml(String((j.jobAd as Record<string, unknown>)?.sections ?? "")),
      url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      posted_at: j.releasedDate ? String(j.releasedDate) : null,
    };
  });
}

export async function fetchRecruiteeBoard(slug: string): Promise<FetchedJob[]> {
  const data = (await fetchJson(`https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`)) as {
    offers: Record<string, unknown>[];
  };
  return (data.offers ?? []).map((j) => ({
    source: `recruitee:${slug}`,
    external_id: String(j.id),
    title: String(j.title ?? ""),
    company: String(j.company_name ?? slug),
    location: [j.city, j.country].filter(Boolean).join(", "),
    remote: /remote/i.test(String(j.remote ?? "") + String(j.location ?? "")),
    salary: "",
    job_type: String(j.employment_type_code ?? ""),
    tags: Array.isArray(j.tags) ? j.tags.map(String) : [],
    description: stripHtml(String(j.description ?? "")),
    url: String(j.careers_url ?? j.careers_apply_url ?? ""),
    posted_at: j.published_at ? String(j.published_at) : null,
  }));
}

// ---- Legal aggregation of LinkedIn / Indeed / Glassdoor / ZipRecruiter ----
// JSearch (RapidAPI) indexes those boards and is the only compliant way to
// reach them programmatically. Free tier available; key set in Controls.
export async function fetchJSearch(key: string, query: string, location: string): Promise<FetchedJob[]> {
  const q = new URLSearchParams({
    query: `${query || "software"} ${location || ""}`.trim(),
    page: "1",
    num_pages: "2",
    date_posted: "week",
  });
  const res = await fetch(`https://jsearch.p.rapidapi.com/search?${q}`, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`JSearch HTTP ${res.status}`);
  const data = (await res.json()) as { data: Record<string, unknown>[] };
  return (data.data ?? []).map((j) => ({
    source: `jsearch:${String(j.job_publisher ?? "web").toLowerCase()}`,
    external_id: String(j.job_id),
    title: String(j.job_title ?? ""),
    company: String(j.employer_name ?? ""),
    location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", "),
    remote: Boolean(j.job_is_remote),
    salary:
      j.job_min_salary && j.job_max_salary
        ? `$${Math.round(Number(j.job_min_salary) / 1000)}k–$${Math.round(Number(j.job_max_salary) / 1000)}k`
        : "",
    job_type: String(j.job_employment_type ?? ""),
    tags: [String(j.job_publisher ?? "")].filter(Boolean),
    description: stripHtml(String(j.job_description ?? "")),
    // Prefer the direct company application link when JSearch exposes it
    url: String(j.job_apply_link ?? j.job_google_link ?? ""),
    posted_at: j.job_posted_at_datetime_utc ? String(j.job_posted_at_datetime_utc) : null,
  }));
}

export async function fetchCareerjet(affid: string, query: string, location: string): Promise<FetchedJob[]> {
  const q = new URLSearchParams({
    affid,
    keywords: query || "",
    location: location || "",
    pagesize: "50",
    user_ip: "1.2.3.4",
    user_agent: "kite",
  });
  const data = (await fetchJson(`https://public.api.careerjet.net/search?${q}`)) as {
    jobs?: Record<string, unknown>[];
  };
  return (data.jobs ?? []).map((j) => ({
    source: "careerjet",
    external_id: String(j.url),
    title: String(j.title ?? ""),
    company: String(j.company ?? ""),
    location: String(j.locations ?? ""),
    remote: /remote/i.test(String(j.locations ?? "") + String(j.title ?? "")),
    salary: String(j.salary ?? ""),
    job_type: "",
    tags: [],
    description: stripHtml(String(j.description ?? "")),
    url: String(j.url ?? ""),
    posted_at: j.date ? String(j.date) : null,
  }));
}

export function detectAtsKind(url: string): string {
  if (/greenhouse\.io|boards\.greenhouse/.test(url)) return "greenhouse";
  if (/jobs\.lever\.co/.test(url)) return "lever";
  if (/myworkdayjobs\.com/.test(url)) return "workday";
  if (/ashbyhq\.com/.test(url)) return "ashby";
  if (/workable\.com/.test(url)) return "workable";
  return "";
}

export function upsertJobs(jobs: FetchedJob[]): { inserted: number; total: number } {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO jobs (source, external_id, title, company, location, remote, salary, job_type, tags_json, description, url, posted_at, ats_kind)
    VALUES (@source, @external_id, @title, @company, @location, @remote, @salary, @job_type, @tags_json, @description, @url, @posted_at, @ats_kind)
    ON CONFLICT(source, external_id) DO NOTHING
  `);
  let inserted = 0;
  const tx = db.transaction((rows: FetchedJob[]) => {
    for (const j of rows) {
      if (!j.title || !j.url) continue;
      const info = stmt.run({
        ...j,
        remote: j.remote ? 1 : 0,
        tags_json: JSON.stringify(j.tags),
        ats_kind: detectAtsKind(j.url),
      });
      inserted += info.changes;
    }
  });
  tx(jobs);
  return { inserted, total: jobs.length };
}

// Default watchlist: well-known companies hiring through Greenhouse/Lever,
// where the Kite agent can submit end-to-end. Fully editable in Controls.
export const DEFAULT_WATCHLIST = [
  // Greenhouse
  "gh:stripe", "gh:airbnb", "gh:coinbase", "gh:databricks", "gh:figma", "gh:notion",
  "gh:doordash", "gh:cloudflare", "gh:dropbox", "gh:duolingo", "gh:gitlab", "gh:instacart",
  "gh:robinhood", "gh:twilio", "gh:airtable", "gh:brex", "gh:discord", "gh:asana",
  "gh:benchling", "gh:samsara", "gh:mongodb", "gh:datadog", "gh:hashicorp", "gh:reddit",
  "gh:pinterest", "gh:lyft", "gh:sofi", "gh:affirm", "gh:chime", "gh:carta",
  // Lever
  "lever:netflix", "lever:spotify", "lever:plaid", "lever:palantir", "lever:attentive",
  "lever:kraken", "lever:ramp", "lever:mixpanel", "lever:vercel", "lever:sourcegraph",
  // Ashby
  "ashby:openai", "ashby:linear", "ashby:supabase", "ashby:replit", "ashby:posthog",
  // SmartRecruiters / Recruitee
  "smartrecruiters:Visa", "smartrecruiters:Bosch", "recruitee:framer",
].join(", ");

export async function refreshAllSources(opts: {
  remotive: boolean;
  arbeitnow: boolean;
  remoteok: boolean;
  search: string;
  watchlist?: string;
  adzuna?: { appId: string; appKey: string; where: string };
  jsearch?: { key: string; where: string };
  careerjet?: { affid: string; where: string };
}): Promise<{ inserted: number; total: number; errors: string[] }> {
  const errors: string[] = [];
  const all: FetchedJob[] = [];
  const tasks: [string, Promise<FetchedJob[]>][] = [];
  if (opts.remotive) tasks.push(["remotive", fetchRemotive(opts.search)]);
  if (opts.arbeitnow) tasks.push(["arbeitnow", fetchArbeitnow()]);
  if (opts.remoteok) tasks.push(["remoteok", fetchRemoteOk()]);
  tasks.push(["jobicy", fetchJobicy()]);
  tasks.push(["himalayas", fetchHimalayas()]);
  tasks.push(["themuse", fetchTheMuse()]);
  if (opts.adzuna?.appId && opts.adzuna?.appKey) {
    tasks.push(["adzuna", fetchAdzuna(opts.adzuna.appId, opts.adzuna.appKey, opts.search, opts.adzuna.where)]);
  }
  if (opts.jsearch?.key) {
    tasks.push(["jsearch (LinkedIn/Indeed/Glassdoor)", fetchJSearch(opts.jsearch.key, opts.search, opts.jsearch.where)]);
  }
  if (opts.careerjet?.affid) {
    tasks.push(["careerjet", fetchCareerjet(opts.careerjet.affid, opts.search, opts.careerjet.where)]);
  }
  for (const entry of (opts.watchlist ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60)) {
    const [kind, slug] = entry.includes(":") ? entry.split(":") : ["gh", entry];
    if (!slug) continue;
    if (kind === "gh" || kind === "greenhouse") tasks.push([entry, fetchGreenhouseBoard(slug)]);
    else if (kind === "lever") tasks.push([entry, fetchLeverBoard(slug)]);
    else if (kind === "ashby") tasks.push([entry, fetchAshbyBoard(slug)]);
    else if (kind === "smartrecruiters" || kind === "sr") tasks.push([entry, fetchSmartRecruitersBoard(slug)]);
    else if (kind === "recruitee") tasks.push([entry, fetchRecruiteeBoard(slug)]);
  }

  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") all.push(...r.value);
    else errors.push(`${tasks[i][0]}: ${r.reason?.message ?? r.reason}`);
  });

  const { inserted, total } = upsertJobs(all);
  return { inserted, total, errors };
}
