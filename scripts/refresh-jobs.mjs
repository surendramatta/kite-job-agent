#!/usr/bin/env node
// CLI job refresher — run from cron for hands-free feed updates, e.g.:
//   0 */4 * * * cd /path/to/tsenta && npm run refresh-jobs
import { openDb, getSetting } from "./lib-db.mjs";

const db = openDb();
const search = process.argv[2] ?? getSetting(db, "aa_keywords", "").split(",")[0]?.trim() ?? "";

const sources = [];
if (getSetting(db, "src_remotive", "1") !== "0")
  sources.push(["remotive", `https://remotive.com/api/remote-jobs?limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`]);
if (getSetting(db, "src_arbeitnow", "1") !== "0")
  sources.push(["arbeitnow", "https://www.arbeitnow.com/api/job-board-api"]);
if (getSetting(db, "src_remoteok", "1") !== "0")
  sources.push(["remoteok", "https://remoteok.com/api"]);

const insert = db.prepare(`
  INSERT INTO jobs (source, external_id, title, company, location, remote, salary, job_type, tags_json, description, url, posted_at, ats_kind)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source, external_id) DO NOTHING
`);

const strip = (html) =>
  String(html ?? "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n").trim();

const ats = (url) =>
  /greenhouse\.io/.test(url) ? "greenhouse"
  : /jobs\.lever\.co/.test(url) ? "lever"
  : /myworkdayjobs\.com/.test(url) ? "workday"
  : /ashbyhq\.com/.test(url) ? "ashby"
  : /workable\.com/.test(url) ? "workable" : "";

let inserted = 0;
for (const [name, url] of sources) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "tsenta-personal-dashboard" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let rows = [];
    if (name === "remotive") {
      rows = (data.jobs ?? []).map((j) => [String(j.id), j.title, j.company_name, j.candidate_required_location ?? "Remote", 1, j.salary ?? "", j.job_type ?? "", JSON.stringify(j.tags ?? []), strip(j.description), j.url, j.publication_date ?? null]);
    } else if (name === "arbeitnow") {
      rows = (data.data ?? []).map((j) => [String(j.slug), j.title, j.company_name, j.location ?? "", j.remote ? 1 : 0, "", (j.job_types ?? []).join(", "), JSON.stringify(j.tags ?? []), strip(j.description), j.url, j.created_at ? new Date(j.created_at * 1000).toISOString() : null]);
    } else {
      rows = (Array.isArray(data) ? data : []).filter((j) => j && j.id).map((j) => [String(j.id), j.position, j.company, j.location ?? "Remote", 1, j.salary_min && j.salary_max ? `$${j.salary_min / 1000}k–$${j.salary_max / 1000}k` : "", "", JSON.stringify(j.tags ?? []), strip(j.description), j.url, j.date ?? null]);
    }
    let n = 0;
    for (const r of rows) {
      if (!r[1] || !r[9]) continue;
      n += insert.run(name, r[0], r[1], r[2] ?? "", r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10], ats(r[9])).changes;
    }
    inserted += n;
    console.log(`${name}: ${rows.length} fetched, ${n} new`);
  } catch (err) {
    console.error(`${name}: FAILED — ${err.message}`);
  }
}
db.prepare("INSERT INTO settings (key,value) VALUES ('last_refresh',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(new Date().toISOString());
console.log(`Total new jobs: ${inserted}`);
