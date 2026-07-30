#!/usr/bin/env node
// Personal apply bot: processes YOUR pending apply-queue items on Greenhouse and
// Lever job pages, autofilling forms from YOUR profile. Runs locally, on your
// own applications only. Usage:
//   npm run apply-bot -- --dry-run          fill forms but never submit
//   npm run apply-bot                        fill and submit
//   npm run apply-bot -- --limit 5           process at most 5 jobs
//   npm run apply-bot -- --headed            watch the browser work

import { openDb, getSetting } from "./lib-db.mjs";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const HEADED = args.includes("--headed");
const LIMIT = parseInt(args[args.indexOf("--limit") + 1], 10) || 10;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm install playwright && npx playwright install chromium");
  process.exit(1);
}

const db = openDb();
const profile = db.prepare("SELECT * FROM profile WHERE id = 1").get();
if (!profile?.full_name || !profile?.email) {
  console.error("Fill in your Profile (name + email) in the dashboard first.");
  process.exit(1);
}
const answers = JSON.parse(profile.answers_json || "[]");
const resumePdf = getSetting(db, "resume_pdf_path");

const dailyLimit = parseInt(getSetting(db, "aa_daily_limit", "20"), 10) || 20;
const todayCount = db
  .prepare("SELECT COUNT(*) n FROM applications WHERE applied_at >= datetime('now','start of day')")
  .get().n;
const budget = Math.min(LIMIT, Math.max(0, dailyLimit - todayCount));

const queue = db
  .prepare(
    `SELECT q.id qid, j.* FROM apply_queue q JOIN jobs j ON j.id = q.job_id
     WHERE q.state = 'pending' AND j.ats_kind IN ('greenhouse','lever')
     ORDER BY q.created_at ASC LIMIT ?`
  )
  .all(budget);

console.log(`Mode: ${DRY_RUN ? "DRY RUN (no submissions)" : "LIVE"} · queue items: ${queue.length} · daily budget left: ${budget}`);
if (queue.length === 0) process.exit(0);

const browser = await chromium.launch({ headless: !HEADED });
const context = await browser.newContext();

for (const job of queue) {
  console.log(`\n→ ${job.title} @ ${job.company} [${job.ats_kind}]`);
  const page = await context.newPage();
  const logs = [];
  const log = (m) => { logs.push(m); console.log("  " + m); };
  let result = "error";
  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (job.ats_kind === "greenhouse") {
      await fillGreenhouse(page, log);
    } else {
      await fillLever(page, log);
    }

    if (DRY_RUN) {
      result = "dry-run";
      log("dry-run: form filled, not submitted");
    } else {
      const submitted = await submit(page, log);
      if (submitted) {
        result = "submitted";
        db.prepare("UPDATE apply_queue SET state='done', processed_at=datetime('now') WHERE id=?").run(job.qid);
        const app = db.prepare("SELECT id FROM applications WHERE job_id=?").get(job.id);
        if (app) {
          db.prepare("UPDATE applications SET status='submitted', applied_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(app.id);
        } else {
          db.prepare("INSERT INTO applications (job_id, status, applied_at) VALUES (?, 'submitted', datetime('now'))").run(job.id);
        }
        log("submitted ✓");
      } else {
        result = "needs-review";
        log("could not confirm submission — review manually");
      }
    }
  } catch (err) {
    log(`error: ${err.message}`);
    db.prepare("UPDATE apply_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?").run(String(err.message), job.qid);
  }
  db.prepare("INSERT INTO bot_runs (job_id, mode, result, log) VALUES (?, ?, ?, ?)").run(
    job.id, DRY_RUN ? "dry-run" : "live", result, logs.join("\n")
  );
  await page.close();
}

await browser.close();
console.log("\nDone.");

// ---------- form fillers ----------

async function fillField(page, selectors, value, log, label) {
  if (!value) return;
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0 && (await el.isVisible().catch(() => false))) {
      await el.fill(value).catch(() => {});
      log(`filled ${label}`);
      return;
    }
  }
}

async function fillGreenhouse(page, log) {
  const [first, ...rest] = (profile.full_name || "").split(" ");
  await fillField(page, ['input#first_name', 'input[name="job_application[first_name]"]', 'input[autocomplete="given-name"]'], first, log, "first name");
  await fillField(page, ['input#last_name', 'input[name="job_application[last_name]"]', 'input[autocomplete="family-name"]'], rest.join(" "), log, "last name");
  await fillField(page, ['input#email', 'input[name="job_application[email]"]', 'input[type="email"]'], profile.email, log, "email");
  await fillField(page, ['input#phone', 'input[name="job_application[phone]"]', 'input[type="tel"]'], profile.phone, log, "phone");
  await fillField(page, ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'], profile.linkedin, log, "linkedin");
  await fillField(page, ['input[name*="website" i], input[id*="website" i]'], profile.portfolio, log, "website");
  await uploadResume(page, ['input#resume', 'input[type="file"][name*="resume" i]', 'input[type="file"]'], log);
  await answerCustomQuestions(page, log);
}

async function fillLever(page, log) {
  const applyBtn = page.locator('a[href*="/apply"], .postings-btn').first();
  if (!page.url().includes("/apply") && (await applyBtn.count()) > 0) {
    await applyBtn.click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
  }
  await fillField(page, ['input[name="name"]'], profile.full_name, log, "name");
  await fillField(page, ['input[name="email"]'], profile.email, log, "email");
  await fillField(page, ['input[name="phone"]'], profile.phone, log, "phone");
  await fillField(page, ['input[name="org"]'], currentCompany(), log, "current company");
  await fillField(page, ['input[name="urls[LinkedIn]"]'], profile.linkedin, log, "linkedin");
  await fillField(page, ['input[name="urls[GitHub]"]'], profile.github, log, "github");
  await fillField(page, ['input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]'], profile.portfolio, log, "portfolio");
  await uploadResume(page, ['input#resume-upload-input', 'input[type="file"][name="resume"]', 'input[type="file"]'], log);
  await answerCustomQuestions(page, log);
}

function currentCompany() {
  try {
    const exp = JSON.parse(profile.experience_json || "[]");
    return exp[0]?.company ?? "";
  } catch {
    return "";
  }
}

async function uploadResume(page, selectors, log) {
  if (!resumePdf) {
    log("no resume_pdf_path set in Settings — skipping file upload");
    return;
  }
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.setInputFiles(resumePdf).catch((e) => log(`resume upload failed: ${e.message}`));
      log("uploaded resume");
      await page.waitForTimeout(2000);
      return;
    }
  }
}

// Match visible question labels against the user's canned screening answers.
async function answerCustomQuestions(page, log) {
  const inputs = page.locator("input[type='text']:visible, textarea:visible");
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i);
    if (await el.inputValue().catch(() => "x")) continue;
    const label = await labelFor(page, el);
    if (!label) continue;
    const match = answers.find((a) => a.question && label.toLowerCase().includes(a.question.toLowerCase()));
    if (match) {
      await el.fill(match.answer).catch(() => {});
      log(`answered: "${label.slice(0, 60)}"`);
    }
  }
}

async function labelFor(page, el) {
  const id = await el.getAttribute("id").catch(() => null);
  if (id) {
    const lbl = page.locator(`label[for="${id}"]`).first();
    if ((await lbl.count()) > 0) return (await lbl.textContent()) ?? "";
  }
  const aria = await el.getAttribute("aria-label").catch(() => null);
  if (aria) return aria;
  const placeholder = await el.getAttribute("placeholder").catch(() => null);
  return placeholder ?? "";
}

async function submit(page, log) {
  const btn = page
    .locator('button[type="submit"], input[type="submit"], button:has-text("Submit application"), button:has-text("Submit Application")')
    .first();
  if ((await btn.count()) === 0) {
    log("no submit button found");
    return false;
  }
  await btn.click();
  log("clicked submit");
  try {
    await page.waitForURL(/confirmation|thanks|thank/i, { timeout: 15000 });
    return true;
  } catch {
    const ok = await page
      .locator("text=/thank you|application.*(submitted|received)/i")
      .first()
      .isVisible()
      .catch(() => false);
    return ok;
  }
}
