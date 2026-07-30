CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  full_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  location TEXT DEFAULT '',
  headline TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  github TEXT DEFAULT '',
  portfolio TEXT DEFAULT '',
  work_auth TEXT DEFAULT '',
  needs_sponsorship INTEGER DEFAULT 0,
  desired_salary TEXT DEFAULT '',
  notice_period TEXT DEFAULT '',
  experience_json TEXT DEFAULT '[]',
  education_json TEXT DEFAULT '[]',
  skills_json TEXT DEFAULT '[]',
  answers_json TEXT DEFAULT '[]'
);
INSERT OR IGNORE INTO profile (id) VALUES (1);

CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  content_json TEXT NOT NULL DEFAULT '{}',
  file_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT DEFAULT '',
  remote INTEGER DEFAULT 0,
  salary TEXT DEFAULT '',
  job_type TEXT DEFAULT '',
  tags_json TEXT DEFAULT '[]',
  description TEXT DEFAULT '',
  url TEXT NOT NULL,
  posted_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now')),
  hidden INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  ats_kind TEXT DEFAULT '',
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_fetched ON jobs(fetched_at DESC);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'preparing',
  resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
  tailored_resume_json TEXT,
  cover_letter TEXT,
  ats_score INTEGER,
  ats_report_json TEXT,
  receipt_json TEXT,
  notes TEXT DEFAULT '',
  applied_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id)
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound',
  from_name TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  category TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apply_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,
  UNIQUE(job_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  result TEXT NOT NULL,
  log TEXT DEFAULT '',
  shots_json TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apply_queue_state_created ON apply_queue(state, created_at);
