"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getDb,
  getProfile,
  getSetting,
  logEvent,
  setSetting,
  Job,
  Resume,
  Receipt,
  APP_STATUSES,
} from "./db";
import { refreshAllSources, upsertJobs, DEFAULT_WATCHLIST } from "./sources";
import { getDefaultResumeContent } from "./matching";
import { ResumeContent } from "./ats";
import { appliedTodayCount, getPreferences } from "./matching";
import { prepareMaterials, approveApplication, confirmSubmittedCore } from "./actions-core";
import { tick } from "./worker";

function revalidateAll(jobId?: number) {
  revalidatePath("/dashboard");
  revalidatePath("/inbox");
  if (jobId) revalidatePath(`/jobs/${jobId}`);
}

// ---------- jobs ----------

export async function refreshJobs(formData: FormData) {
  let search = String(formData.get("search") ?? "");
  if (!search) search = getDefaultResumeContent()?.skills?.[0] ?? "";
  const enabled = (k: string) => getSetting(k, "1") !== "0";
  const result = await refreshAllSources({
    remotive: enabled("src_remotive"),
    arbeitnow: enabled("src_arbeitnow"),
    remoteok: enabled("src_remoteok"),
    search,
    watchlist: getSetting("watch_companies", DEFAULT_WATCHLIST),
    adzuna: { appId: getSetting("adzuna_app_id"), appKey: getSetting("adzuna_app_key"), where: getSetting("pref_locations").split(",")[0] ?? "" },
    jsearch: { key: getSetting("jsearch_key"), where: getSetting("pref_locations").split(",")[0] ?? "" },
    careerjet: { affid: getSetting("careerjet_affid"), where: getSetting("pref_locations").split(",")[0] ?? "" },
  });
  setSetting("last_refresh", new Date().toISOString());
  setSetting("last_refresh_result", JSON.stringify(result));
  revalidateAll();
}

export async function addJobByUrl(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!url || !title || !company) return;
  upsertJobs([
    {
      source: "manual",
      external_id: url,
      title,
      company,
      location,
      remote: /remote/i.test(location + " " + description),
      salary: "",
      job_type: "",
      tags: [],
      description,
      url,
      posted_at: new Date().toISOString(),
    },
  ]);
  revalidateAll();
  redirect("/dashboard");
}

export async function hideJob(formData: FormData) {
  const id = Number(formData.get("id"));
  getDb().prepare("UPDATE jobs SET hidden = 1 WHERE id = ?").run(id);
  revalidateAll(id);
}

// ---------- apply flow: match -> prepare -> approve -> in flight ----------

// "Apply": create the application and generate tailored materials + a draft
// receipt. Lands in "Needs you" for approval before anything is sent.
export async function applyToJob(formData: FormData) {
  const jobId = Number(formData.get("job_id"));
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as Job | undefined;
  if (!job) return;

  const existing = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(jobId) as
    | { id: number }
    | undefined;
  let appId: number;
  if (existing) {
    appId = existing.id;
  } else {
    const info = db
      .prepare("INSERT INTO applications (job_id, status) VALUES (?, 'preparing')")
      .run(jobId);
    appId = Number(info.lastInsertRowid);
    logEvent(appId, "created", "added to queue");
  }

  await prepareMaterials(appId, job);
  revalidateAll(jobId);
  redirect(`/applications/${appId}/review`);
}

export async function runAgentNow() {
  await tick(true);
  revalidateAll();
}

// "Apply to all N": create + prepare every listed match; they land in
// Review Required for one-by-one approval.
export async function applyToAllMatches(formData: FormData) {
  const ids = formData.getAll("job_ids").map(Number).filter(Boolean);
  const db = getDb();
  for (const jobId of ids) {
    const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as Job | undefined;
    if (!job) continue;
    const existing = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(jobId) as
      | { id: number }
      | undefined;
    let appId: number;
    if (existing) {
      appId = existing.id;
    } else {
      const info = db.prepare("INSERT INTO applications (job_id, status) VALUES (?, 'preparing')").run(jobId);
      appId = Number(info.lastInsertRowid);
      logEvent(appId, "created", "apply to all");
    }
    await prepareMaterials(appId, job);
  }
  revalidateAll();
  redirect("/dashboard?filter=needs_you");
}

export async function regenerateMaterials(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  const db = getDb();
  const app = db.prepare("SELECT job_id FROM applications WHERE id = ?").get(appId) as
    | { job_id: number }
    | undefined;
  if (!app) return;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(app.job_id) as Job;
  await prepareMaterials(appId, job);
  revalidatePath(`/applications/${appId}/review`);
}

// Approve & send: finalize the receipt and move to In flight. The Playwright
// bot picks up approved Greenhouse/Lever applications for real submission.
export async function approveAndSend(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  const editedCover = formData.get("cover_letter");
  const db = getDb();
  const app = db.prepare("SELECT job_id FROM applications WHERE id = ?").get(appId) as
    | { job_id: number }
    | undefined;
  if (!app) return;

  const prefs = getPreferences();
  if (appliedTodayCount() >= prefs.dailyLimit) {
    db.prepare(
      "UPDATE applications SET notes = 'Daily limit reached — try tomorrow', updated_at = datetime('now') WHERE id = ?"
    ).run(appId);
    revalidatePath(`/applications/${appId}/review`);
    return;
  }

  if (editedCover != null) {
    db.prepare("UPDATE applications SET cover_letter = ? WHERE id = ?").run(String(editedCover), appId);
  }

  approveApplication(appId);
  void tick(); // the in-app agent picks up the submission immediately
  revalidateAll(app.job_id);
  redirect(`/applications/${appId}`);
}

export async function confirmSubmitted(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  confirmSubmittedCore(appId);
  revalidateAll();
  revalidatePath(`/applications/${appId}`);
}

export async function skipApplication(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  const db = getDb();
  const app = db.prepare("SELECT job_id FROM applications WHERE id = ?").get(appId) as
    | { job_id: number }
    | undefined;
  db.prepare("UPDATE applications SET status = 'skipped', updated_at = datetime('now') WHERE id = ?").run(appId);
  if (app) db.prepare("DELETE FROM apply_queue WHERE job_id = ?").run(app.job_id);
  logEvent(appId, "skipped");
  revalidateAll(app?.job_id);
}

export async function skipJob(formData: FormData) {
  const jobId = Number(formData.get("job_id"));
  const db = getDb();
  const existing = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(jobId) as
    | { id: number }
    | undefined;
  if (existing) {
    db.prepare("UPDATE applications SET status = 'skipped', updated_at = datetime('now') WHERE id = ?").run(existing.id);
  } else {
    const info = db.prepare("INSERT INTO applications (job_id, status) VALUES (?, 'skipped')").run(jobId);
    logEvent(Number(info.lastInsertRowid), "skipped", "from match feed");
  }
  revalidateAll(jobId);
}

export async function updateAppStatus(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  const status = String(formData.get("status"));
  if (!(APP_STATUSES as readonly string[]).includes(status)) return;
  getDb()
    .prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, appId);
  logEvent(appId, "status_change", status);
  revalidateAll();
}

export async function deleteApplication(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  getDb().prepare("DELETE FROM applications WHERE id = ?").run(appId);
  revalidateAll();
}

// ---------- inbox ----------

export async function logRecruiterReply(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  const fromName = String(formData.get("from_name") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");
  const category = String(formData.get("category") ?? "");
  const effect = String(formData.get("effect") ?? "");
  if (!appId || !body) return;
  const db = getDb();
  db.prepare(
    "INSERT INTO inbox_messages (application_id, direction, from_name, subject, body, category) VALUES (?, 'inbound', ?, ?, ?, ?)"
  ).run(appId, fromName, subject, body, category);
  if (effect && (APP_STATUSES as readonly string[]).includes(effect)) {
    db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(effect, appId);
    logEvent(appId, "recruiter_reply", `status → ${effect}`);
  }
  revalidateAll();
}

export async function markInboxRead() {
  getDb().prepare("UPDATE inbox_messages SET read = 1").run();
  revalidatePath("/inbox");
}

export async function logOutboundReply(formData: FormData) {
  const appId = Number(formData.get("app_id"));
  const body = String(formData.get("body") ?? "");
  if (!appId || !body) return;
  getDb()
    .prepare(
      "INSERT INTO inbox_messages (application_id, direction, from_name, subject, body) VALUES (?, 'outbound', 'You', '', ?)"
    )
    .run(appId, body);
  revalidatePath("/inbox");
}

// ---------- resumes ----------

export async function saveResume(formData: FormData) {
  const id = Number(formData.get("id") ?? 0);
  const name = String(formData.get("name") ?? "Resume").trim() || "Resume";
  const content: ResumeContent = {
    summary: String(formData.get("summary") ?? ""),
    skills: String(formData.get("skills") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    experience: parseJsonArray(formData.get("experience_json")),
    education: parseJsonArray(formData.get("education_json")),
  };
  const db = getDb();
  if (id) {
    db.prepare(
      "UPDATE resumes SET name = ?, content_json = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(name, JSON.stringify(content), id);
  } else {
    const count = (db.prepare("SELECT COUNT(*) n FROM resumes").get() as { n: number }).n;
    db.prepare("INSERT INTO resumes (name, content_json, is_default) VALUES (?, ?, ?)").run(
      name,
      JSON.stringify(content),
      count === 0 ? 1 : 0
    );
  }
  revalidatePath("/resumes");
  redirect("/resumes");
}

function parseJsonArray(v: FormDataEntryValue | null): never[] {
  try {
    const parsed = JSON.parse(String(v ?? "[]"));
    return Array.isArray(parsed) ? (parsed as never[]) : [];
  } catch {
    return [];
  }
}

export async function duplicateResume(formData: FormData) {
  const id = Number(formData.get("id"));
  const db = getDb();
  const src = db.prepare("SELECT * FROM resumes WHERE id = ?").get(id) as Resume | undefined;
  if (!src) return;
  const info = db
    .prepare("INSERT INTO resumes (name, content_json) VALUES (?, ?)")
    .run(`${src.name} copy`, src.content_json);
  revalidatePath("/resumes");
  redirect(`/resumes?v=${info.lastInsertRowid}`);
}

export async function setDefaultResume(formData: FormData) {
  const id = Number(formData.get("id"));
  const db = getDb();
  db.prepare("UPDATE resumes SET is_default = 0").run();
  db.prepare("UPDATE resumes SET is_default = 1 WHERE id = ?").run(id);
  revalidatePath("/resumes");
}

export async function deleteResume(formData: FormData) {
  const id = Number(formData.get("id"));
  getDb().prepare("DELETE FROM resumes WHERE id = ?").run(id);
  revalidatePath("/resumes");
}

// ---------- profile ----------

export async function saveProfile(formData: FormData) {
  const fields = [
    "full_name", "email", "phone", "location", "headline", "summary",
    "linkedin", "github", "portfolio", "work_auth", "desired_salary", "notice_period",
  ];
  const db = getDb();
  const sets = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => String(formData.get(f) ?? ""));
  let workPrefs = "{}";
  try {
    workPrefs = JSON.stringify(JSON.parse(String(formData.get("work_prefs_json") ?? "{}")));
  } catch {}
  db.prepare(
    `UPDATE profile SET ${sets}, needs_sponsorship = ?, experience_json = ?, education_json = ?, skills_json = ?, answers_json = ?, work_prefs_json = ? WHERE id = 1`
  ).run(
    ...values,
    formData.get("needs_sponsorship") ? 1 : 0,
    JSON.stringify(parseJsonArray(formData.get("experience_json"))),
    JSON.stringify(parseJsonArray(formData.get("education_json"))),
    JSON.stringify(
      String(formData.get("skills") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
    JSON.stringify(parseJsonArray(formData.get("answers_json"))),
    workPrefs
  );
  revalidatePath("/profile");
}

// ---------- onboarding ----------

export async function completeOnboarding(formData: FormData) {
  const db = getDb();
  db.prepare("UPDATE profile SET full_name = ?, email = ?, work_auth = ?, needs_sponsorship = ? WHERE id = 1").run(
    String(formData.get("full_name") ?? ""),
    String(formData.get("email") ?? ""),
    String(formData.get("work_auth") ?? ""),
    formData.get("needs_sponsorship") ? 1 : 0
  );
  setSetting("pref_roles", String(formData.get("roles") ?? ""));
  setSetting("pref_locations", String(formData.get("locations") ?? ""));
  setSetting("pref_remote_only", formData.get("remote_only") ? "1" : "0");
  setSetting("pref_salary_min", String(formData.get("salary_min") ?? "0"));
  setSetting("pref_experience", String(formData.get("experience") ?? ""));
  setSetting("pref_work_auth", String(formData.get("work_auth") ?? ""));
  setSetting("pref_needs_sponsorship", formData.get("needs_sponsorship") ? "1" : "0");
  setSetting("onboarded", "1");
  revalidateAll();
  redirect("/resumes");
}

// ---------- settings ----------

export async function saveSettings(formData: FormData) {
  const keys = [
    "pref_roles", "pref_locations", "pref_salary_min", "pref_experience",
    "pref_exclude_keywords", "pref_exclude_companies", "pref_min_match",
    "aa_daily_limit", "anthropic_api_key", "resume_pdf_path", "tsenta_rules",
    "email_imap_host", "email_imap_user", "email_imap_pass", "watch_companies", "adzuna_app_id", "adzuna_app_key", "jsearch_key", "careerjet_affid",
  ];
  for (const k of keys) setSetting(k, String(formData.get(k) ?? ""));
  setSetting("pref_remote_only", formData.get("pref_remote_only") ? "1" : "0");
  setSetting("pref_usa_only", formData.get("pref_usa_only") ? "1" : "0");
  setSetting("pref_needs_sponsorship", formData.get("pref_needs_sponsorship") ? "1" : "0");
  setSetting("autopilot_enabled", formData.get("autopilot_enabled") ? "1" : "0");
  setSetting("autopilot_hands_off", formData.get("autopilot_hands_off") ? "1" : "0");
  setSetting("agent_dry_run", formData.get("agent_dry_run") ? "1" : "0");
  setSetting("email_enabled", formData.get("email_enabled") ? "1" : "0");
  for (const src of ["src_remotive", "src_arbeitnow", "src_remoteok"]) {
    setSetting(src, formData.get(src) ? "1" : "0");
  }
  revalidatePath("/settings");
  revalidateAll();
}
