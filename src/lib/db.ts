import { openDatabase, Db } from "./sqlite";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.KITE_DATA_DIR || path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __db?: Db };

export function getDb(): Db {
  if (globalForDb.__db) return globalForDb.__db;
  // Carry data forward from the pre-rebrand database file.
  const oldPath = path.join(DATA_DIR, "tsenta.db");
  const newPath = path.join(DATA_DIR, "kite.db");
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) fs.renameSync(oldPath, newPath);
  const db = openDatabase(newPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  globalForDb.__db = db;
  return db;
}

function migrate(db: Db) {
  const schemaPath = path.join(process.cwd(), "src", "lib", "schema.sql");
  db.exec(fs.readFileSync(schemaPath, "utf-8"));

  // Upgrade databases created before the Tsenta-style rework.
  const appCols = (db.pragma("table_info(applications)") as { name: string }[]).map((c) => c.name);
  if (!appCols.includes("receipt_json")) {
    db.exec("ALTER TABLE applications ADD COLUMN receipt_json TEXT");
  }
  db.exec(`
    UPDATE applications SET status = CASE status
      WHEN 'applied' THEN 'submitted'
      WHEN 'interview' THEN 'interviewing'
      WHEN 'queued' THEN 'pending_approval'
      WHEN 'viewed' THEN 'needs_you'
      WHEN 'withdrawn' THEN 'skipped'
      ELSE status END
    WHERE status IN ('applied','interview','queued','viewed','withdrawn');
  `);
  const inboxCols = (db.pragma("table_info(inbox_messages)") as { name: string }[]).map((c) => c.name);
  if (!inboxCols.includes("category")) {
    db.exec("ALTER TABLE inbox_messages ADD COLUMN category TEXT DEFAULT ''");
    db.exec("ALTER TABLE inbox_messages ADD COLUMN read INTEGER DEFAULT 0");
  }
  const runCols = (db.pragma("table_info(bot_runs)") as { name: string }[]).map((c) => c.name);
  if (!runCols.includes("shots_json")) {
    db.exec("ALTER TABLE bot_runs ADD COLUMN shots_json TEXT DEFAULT '[]'");
  }
  const profCols = (db.pragma("table_info(profile)") as { name: string }[]).map((c) => c.name);
  if (!profCols.includes("work_prefs_json")) {
    db.exec("ALTER TABLE profile ADD COLUMN work_prefs_json TEXT DEFAULT '{}'");
  }

  // One-time cleanup: older builds marked non-agent applications "Submitted"
  // on approval without a real submission. Move them back to Needs you so
  // the tracker tells the truth; the user confirms the ones they did send.
  const migrated = db
    .prepare("SELECT value FROM settings WHERE key = 'migrated_honest_statuses'")
    .get() as { value: string } | undefined;
  if (!migrated) {
    db.prepare(
      `UPDATE applications SET status = 'needs_you',
       notes = 'Materials ready — finish on the career page, then hit “I submitted it”'
       WHERE status = 'submitted'
       AND (receipt_json IS NULL OR receipt_json LIKE '%via the posting''s career page%')`
    ).run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migrated_honest_statuses', '1')").run();
  }
}

export type Job = {
  id: number;
  source: string;
  external_id: string | null;
  title: string;
  company: string;
  location: string;
  remote: number;
  salary: string;
  job_type: string;
  tags_json: string;
  description: string;
  url: string;
  posted_at: string | null;
  fetched_at: string;
  hidden: number;
  saved: number;
  ats_kind: string;
};

export type Application = {
  id: number;
  job_id: number;
  status: string;
  resume_id: number | null;
  tailored_resume_json: string | null;
  cover_letter: string | null;
  ats_score: number | null;
  ats_report_json: string | null;
  receipt_json: string | null;
  notes: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Resume = {
  id: number;
  name: string;
  is_default: number;
  content_json: string;
  file_path: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  linkedin: string;
  github: string;
  portfolio: string;
  work_auth: string;
  needs_sponsorship: number;
  desired_salary: string;
  notice_period: string;
  experience_json: string;
  education_json: string;
  skills_json: string;
  answers_json: string;
  work_prefs_json: string;
};

export const APP_STATUSES = [
  "preparing",
  "pending_approval",
  "in_flight",
  "submitted",
  "needs_you",
  "interviewing",
  "offer",
  "ghosted",
  "failed",
  "skipped",
  "rejected",
] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  preparing: "Tailoring résumé",
  pending_approval: "Review Required",
  in_flight: "Applying",
  submitted: "Submitted",
  needs_you: "Needs you",
  interviewing: "Interviewing",
  offer: "Offer",
  ghosted: "Ghosted",
  failed: "Application Failed",
  skipped: "Skipped",
  rejected: "Rejected",
};

export type Receipt = {
  fields: { label: string; value: string }[];
  answers: { question: string; answer: string }[];
  resume_name: string;
  cover_letter_included: boolean;
  submitted_via: string;
  confirmation: string;
  submitted_at: string;
};

export type InboxMessage = {
  id: number;
  application_id: number;
  direction: string;
  from_name: string;
  subject: string;
  body: string;
  category: string;
  read: number;
  created_at: string;
};

export function timeAgo(iso: string): string {
  const then = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z").getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "a day ago";
  return `${days} days ago`;
}

export function getSetting(key: string, fallback = ""): string {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}

export function getProfile(): Profile {
  return getDb().prepare("SELECT * FROM profile WHERE id = 1").get() as Profile;
}

export function logEvent(applicationId: number, event: string, detail = "") {
  getDb()
    .prepare(
      "INSERT INTO app_events (application_id, event, detail) VALUES (?, ?, ?)"
    )
    .run(applicationId, event, detail);
}
