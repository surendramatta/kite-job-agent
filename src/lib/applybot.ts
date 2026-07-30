// In-app apply agent: fills and submits Greenhouse/Lever application forms
// from the user's profile, entirely inside the Next.js server process.
import fs from "fs";
import path from "path";
import { getDb, getProfile, getSetting, setSetting, logEvent } from "./db";
import { launchBrowser, BROWSER_HELP } from "./browser";
import { ensureTailoredPdf } from "./resumepdf";
import { fetchVerificationCode } from "./emailsync";

type QueueItem = {
  qid: number;
  job_id: number;
  title: string;
  company: string;
  url: string;
  ats_kind: string;
};

let running = false;

export function isAgentRunning() {
  return running;
}

export async function processApplyQueue(opts?: { limit?: number }): Promise<{ processed: number; error?: string }> {
  if (running) return { processed: 0 };
  running = true;
  try {
    return await processInner(opts?.limit ?? 10);
  } finally {
    running = false;
  }
}

async function processInner(limit: number): Promise<{ processed: number; error?: string }> {
  const db = getDb();
  // Recover jobs left behind by a crashed worker, then atomically claim a
  // batch. SQLite's IMMEDIATE transaction prevents two worker processes from
  // claiming the same application.
  db.prepare(
    `UPDATE apply_queue SET state = 'pending', last_error = 'worker lease expired'
     WHERE state = 'processing' AND processed_at < datetime('now', '-15 minutes')`
  ).run();

  const claim = db.transaction((batchSize: number) => {
    const items = db
      .prepare(
        `SELECT q.id qid, j.id job_id, j.title, j.company, j.url, j.ats_kind
         FROM apply_queue q JOIN jobs j ON j.id = q.job_id
         JOIN applications a ON a.job_id = j.id
         WHERE q.state = 'pending' AND a.status = 'in_flight'
         ORDER BY q.created_at ASC LIMIT ?`
      )
      .all(batchSize) as QueueItem[];
    const mark = db.prepare(
      `UPDATE apply_queue SET state = 'processing', processed_at = datetime('now')
       WHERE id = ? AND state = 'pending'`
    );
    return items.filter((item) => mark.run(item.qid).changes === 1);
  });
  const queue = (claim as typeof claim & { immediate: (limit: number) => QueueItem[] }).immediate(limit);
  if (queue.length === 0) return { processed: 0 };

  const profile = getProfile();
  const answers = JSON.parse(profile.answers_json || "[]") as { question: string; answer: string }[];
  const baseResumePdf = getSetting("resume_pdf_path");
  const dryRun = getSetting("agent_dry_run", "0") === "1";

  const browser = await launchBrowser();
  if (!browser) {
    const release = db.prepare(
      "UPDATE apply_queue SET state = 'pending', processed_at = NULL, last_error = ? WHERE id = ?"
    );
    for (const job of queue) release.run(BROWSER_HELP, job.qid);
    return { processed: 0, error: BROWSER_HELP };
  }

  let processed = 0;
  for (const job of queue) {
    const context = await browser.newContext({
      acceptDownloads: false,
      viewport: { width: 1440, height: 1000 },
    });
    const logs: string[] = [];
    const log = (m: string) => logs.push(m);
    let result = "error";
    const page = await context.newPage();
    // Live view: every step is captured so the user can watch what happened.
    const shotDir = path.join(process.env.KITE_DATA_DIR || path.join(process.cwd(), "data"), "runs", String(job.job_id));
    fs.mkdirSync(shotDir, { recursive: true });
    for (const f of fs.readdirSync(shotDir)) fs.unlinkSync(path.join(shotDir, f));
    let shotNo = 0;
    const shots: { file: string; caption: string }[] = [];
    const shot = async (caption: string) => {
      try {
        const file = `${String(++shotNo).padStart(2, "0")}.png`;
        await page.screenshot({ path: path.join(shotDir, file), fullPage: false });
        shots.push({ file, caption });
        setSetting("agent_live", JSON.stringify({ jobId: job.job_id, step: caption, at: Date.now() }));
      } catch {}
    };
    try {
      // Prefer a per-job tailored resume PDF; fall back to the uploaded base.
      const appRow = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(job.job_id) as
        | { id: number }
        | undefined;
      let resumePdf = baseResumePdf;
      if (appRow) {
        const tailored = await ensureTailoredPdf(appRow.id).catch(() => null);
        if (tailored) {
          resumePdf = tailored;
          log("generated tailored resume PDF for this role");
        }
      }

      setSetting("agent_live", JSON.stringify({ jobId: job.job_id, step: `Opening ${job.company}…`, at: Date.now() }));
      await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await shot("Opened the job posting");
      const kind = await resolveAts(page, job.ats_kind, log);
      if (kind && kind !== job.ats_kind) {
        db.prepare("UPDATE jobs SET ats_kind = ? WHERE id = ?").run(kind, job.job_id);
      }
      if (kind === "greenhouse") await fillGreenhouse(page, profile, answers, resumePdf, log);
      else if (kind === "lever") await fillLever(page, profile, answers, resumePdf, log);
      else await fillGeneric(page, profile, answers, resumePdf, log);
      await shot("Filled the application form");

      if (dryRun) {
        result = "dry-run";
        log("dry-run mode: form filled, not submitted");
        setAppStatus(job.job_id, "needs_you", "Dry run complete — submit manually or disable dry-run");
        db.prepare("UPDATE apply_queue SET state='done', processed_at=datetime('now') WHERE id=?").run(job.qid);
      } else {
        let ok = await submit(page, log);
        if (!ok) {
          // Validation errors? Answer whatever the form flagged and retry once.
          const hasErrors = await page
            .locator("text=/required|please (select|complete|fill|choose)|can't be blank/i")
            .first()
            .isVisible()
            .catch(() => false);
          if (hasErrors) {
            log("form flagged required fields — answering and retrying");
            await answerSelects(page, profile, answers, log);
            await answerQuestions(page, answers, log);
            ok = await submit(page, log);
          }
        }
        // Some ATSs email a verification code before accepting the
        // application — fetch it from the user's inbox and enter it.
        if (!ok) ok = await handleVerificationCode(page, log);
        await shot(ok ? "Submitted — confirmation page" : "After submit");
        if (ok) {
          result = "submitted";
          db.prepare("UPDATE apply_queue SET state='done', processed_at=datetime('now') WHERE id=?").run(job.qid);
          setAppStatus(job.job_id, "submitted", "");
          appendReceiptConfirmation(job.job_id, `Submitted by the Kite agent via ${kind || "the career page"}`, kind);
          log("submitted ✓");
        } else {
          result = "needs-review";
          setAppStatus(job.job_id, "needs_you", `Agent filled the form${kind ? ` on ${kind}` : ""} but could not confirm submission — finish manually`);
          db.prepare("UPDATE apply_queue SET state = 'pending', processed_at = NULL, attempts = attempts + 1, last_error = 'unconfirmed submission' WHERE id = ?").run(job.qid);
          log("could not confirm submission");
        }
      }
      processed++;
    } catch (err) {
      const msg = (err as Error).message.split("\n")[0];
      log(`error: ${msg}`);
      db.prepare("UPDATE apply_queue SET state = 'pending', processed_at = NULL, attempts = attempts + 1, last_error = ? WHERE id = ?").run(msg, job.qid);
      const attempts = (db.prepare("SELECT attempts FROM apply_queue WHERE id = ?").get(job.qid) as { attempts: number }).attempts;
      if (attempts >= 3) {
        db.prepare("UPDATE apply_queue SET state='failed' WHERE id=?").run(job.qid);
        setAppStatus(job.job_id, "failed", `Agent error: ${msg}`);
      }
    }
    await shot("Final state").catch(() => {});
    db.prepare("INSERT INTO bot_runs (job_id, mode, result, log, shots_json) VALUES (?, ?, ?, ?, ?)").run(
      job.job_id, dryRun ? "dry-run" : "live", result, logs.join("\n"), JSON.stringify(shots)
    );
    setSetting("agent_live", "");
    await page.close();
    await context.close();
  }
  await browser.close();
  return { processed };
}

function setAppStatus(jobId: number, status: string, note: string) {
  const db = getDb();
  db.prepare(
    `UPDATE applications SET status = ?, notes = ?, updated_at = datetime('now'),
     applied_at = CASE WHEN ? = 'submitted' AND applied_at IS NULL THEN datetime('now') ELSE applied_at END
     WHERE job_id = ?`
  ).run(status, note, status, jobId);
  const app = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(jobId) as { id: number } | undefined;
  if (app) logEvent(app.id, "agent", `${status}${note ? ` — ${note}` : ""}`);
}

function appendReceiptConfirmation(jobId: number, confirmation: string, via?: string) {
  const db = getDb();
  const app = db.prepare("SELECT id, receipt_json FROM applications WHERE job_id = ?").get(jobId) as
    | { id: number; receipt_json: string | null }
    | undefined;
  if (!app?.receipt_json) return;
  try {
    const receipt = JSON.parse(app.receipt_json);
    receipt.confirmation = confirmation;
    if (via) receipt.submitted_via = via;
    receipt.submitted_at = new Date().toISOString();
    db.prepare("UPDATE applications SET receipt_json = ? WHERE id = ?").run(JSON.stringify(receipt), app.id);
  } catch {}
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = any;
type ProfileRow = ReturnType<typeof getProfile>;
type Answer = { question: string; answer: string };

async function fillField(page: Page, selectors: string[], value: string, log: (m: string) => void, label: string) {
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

// Aggregator links usually bounce to the company's real ATS. Follow apply
// links/iframes/redirects so Kite can submit far more than pre-tagged jobs.
async function resolveAts(page: Page, known: string, log: (m: string) => void): Promise<string> {
  const kindOf = (u: string) =>
    /greenhouse\.io/.test(u) ? "greenhouse"
    : /lever\.co/.test(u) ? "lever"
    : /ashbyhq\.com/.test(u) ? "ashby"
    : /workable\.com/.test(u) ? "workable"
    : /smartrecruiters\.com/.test(u) ? "smartrecruiters"
    : /recruitee\.com/.test(u) ? "recruitee"
    : /myworkdayjobs\.com/.test(u) ? "workday" : "";

  let kind = kindOf(page.url()) || known;
  if (kind) return kind;

  // Embedded ATS iframe (very common on company career pages)
  const frames: string[] = page.frames().map((f: Page) => f.url());
  for (const f of frames) {
    const k = kindOf(f);
    if (k) {
      log(`found embedded ${k} form — switching to it`);
      await page.goto(f, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      return k;
    }
  }

  // A link or button that leads to the real application
  const link = page
    .locator('a[href*="greenhouse.io"], a[href*="lever.co"], a[href*="ashbyhq.com"], a[href*="workable.com"], a[href*="smartrecruiters.com"], a[href*="recruitee.com"], a:has-text("Apply"), a:has-text("Apply now")')
    .first();
  if ((await link.count()) > 0) {
    const href = await link.getAttribute("href").catch(() => null);
    if (href) {
      const abs = href.startsWith("http") ? href : new URL(href, page.url()).href;
      log(`following apply link → ${abs.slice(0, 70)}`);
      await page.goto(abs, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      kind = kindOf(page.url());
      if (kind) return kind;
    }
  }
  return kind;
}

// Best-effort filler for any application form we don't have a recipe for:
// match visible inputs by their label/name/placeholder.
async function fillGeneric(page: Page, p: ProfileRow, answers: Answer[], resumePdf: string, log: (m: string) => void) {
  log("unknown ATS — using the generic form filler");
  const [first, ...rest] = (p.full_name || "").split(" ");
  const map: [RegExp, string][] = [
    [/first.?name|given.?name/i, first],
    [/last.?name|surname|family.?name/i, rest.join(" ")],
    [/full.?name|^name$|your name/i, p.full_name],
    [/e-?mail/i, p.email],
    [/phone|mobile|tel/i, p.phone],
    [/linkedin/i, p.linkedin],
    [/github/i, p.github],
    [/website|portfolio/i, p.portfolio],
    [/city|location|address/i, p.location],
    [/salary|compensation|expected/i, p.desired_salary],
    [/notice|availability|start/i, p.notice_period],
  ];
  const inputs = page.locator("input[type=text]:visible, input[type=email]:visible, input[type=tel]:visible, input[type=url]:visible, input:not([type]):visible, textarea:visible");
  const n = await inputs.count();
  for (let i = 0; i < Math.min(n, 40); i++) {
    const el = inputs.nth(i);
    if (await el.inputValue().catch(() => "x")) continue;
    const hint = `${await labelFor(page, el)} ${(await el.getAttribute("name").catch(() => "")) ?? ""}`;
    const custom = answers.find((a) => a.question && hint.toLowerCase().includes(a.question.toLowerCase()));
    const hit = custom ? custom.answer : map.find(([re, v]) => v && re.test(hint))?.[1];
    if (hit) {
      await el.fill(hit).catch(() => {});
      log(`filled "${hint.trim().slice(0, 40)}"`);
    }
  }
  await uploadResume(page, ['input[type="file"][name*="resume" i]', 'input[type="file"][name*="cv" i]', 'input[type="file"]'], resumePdf, log);
  await answerSelects(page, p, answers, log);
}

async function fillGreenhouse(page: Page, p: ProfileRow, answers: Answer[], resumePdf: string, log: (m: string) => void) {
  const [first, ...rest] = (p.full_name || "").split(" ");
  await fillField(page, ["input#first_name", 'input[name="job_application[first_name]"]', 'input[autocomplete="given-name"]'], first, log, "first name");
  await fillField(page, ["input#last_name", 'input[name="job_application[last_name]"]', 'input[autocomplete="family-name"]'], rest.join(" "), log, "last name");
  await fillField(page, ["input#email", 'input[name="job_application[email]"]', 'input[type="email"]'], p.email, log, "email");
  await fillField(page, ["input#phone", 'input[name="job_application[phone]"]', 'input[type="tel"]'], p.phone, log, "phone");
  await fillField(page, ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'], p.linkedin, log, "linkedin");
  await uploadResume(page, ["input#resume", 'input[type="file"][name*="resume" i]', 'input[type="file"]'], resumePdf, log);
  await answerSelects(page, p, answers, log);
  await answerQuestions(page, answers, log);
}

async function fillLever(page: Page, p: ProfileRow, answers: Answer[], resumePdf: string, log: (m: string) => void) {
  if (!page.url().includes("/apply")) {
    const applyBtn = page.locator('a[href*="/apply"], .postings-btn').first();
    if ((await applyBtn.count()) > 0) {
      await applyBtn.click().catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }
  await fillField(page, ['input[name="name"]'], p.full_name, log, "name");
  await fillField(page, ['input[name="email"]'], p.email, log, "email");
  await fillField(page, ['input[name="phone"]'], p.phone, log, "phone");
  await fillField(page, ['input[name="urls[LinkedIn]"]'], p.linkedin, log, "linkedin");
  await fillField(page, ['input[name="urls[GitHub]"]'], p.github, log, "github");
  await uploadResume(page, ["input#resume-upload-input", 'input[type="file"][name="resume"]', 'input[type="file"]'], resumePdf, log);
  await answerSelects(page, p, answers, log);
  await answerQuestions(page, answers, log);
}

async function uploadResume(page: Page, selectors: string[], resumePdf: string, log: (m: string) => void) {
  if (!resumePdf || !fs.existsSync(resumePdf)) {
    log("no resume file available for upload — set one on the Resume page");
    return;
  }
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      await el.setInputFiles(resumePdf).catch((e: Error) => log(`resume upload failed: ${e.message.split("\n")[0]}`));
      log("uploaded resume");
      await page.waitForTimeout(2000);
      return;
    }
  }
}

// Answer required dropdowns/radios the way a person would: work auth,
// sponsorship, "how did you hear", demographics (prefer not to say), plus
// any custom question matching the user's saved answers.
async function answerSelects(page: Page, p: ProfileRow, answers: Answer[], log: (m: string) => void) {
  const selects = page.locator("select:visible");
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    const el = selects.nth(i);
    const current = await el.inputValue().catch(() => "");
    if (current) continue;
    const label = (await labelFor(page, el)).toLowerCase();
    const options: string[] = await el.locator("option").allTextContents().catch(() => []);
    const pick = (re: RegExp) => options.find((o) => re.test(o) && o.trim());
    let choice: string | undefined;
    const custom = answers.find((a) => a.question && label.includes(a.question.toLowerCase()));
    if (custom) choice = pick(new RegExp(custom.answer, "i")) ?? custom.answer;
    else if (/sponsor/i.test(label)) choice = p.needs_sponsorship ? pick(/yes/i) : pick(/no/i);
    else if (/authori[sz]ed|legally|eligible to work/i.test(label)) choice = pick(/yes/i);
    else if (/hear about|source|referr/i.test(label)) choice = pick(/linkedin|job board|website|other/i);
    else if (/gender|race|ethnic|veteran|disab|hispanic|orientation/i.test(label))
      choice = pick(/decline|prefer not|don'?t wish/i);
    else if (/18|age/i.test(label)) choice = pick(/yes/i);
    if (choice) {
      await el.selectOption({ label: choice }).catch(async () => {
        await el.selectOption(choice!).catch(() => {});
      });
      log(`selected "${choice.trim().slice(0, 40)}" for "${label.slice(0, 50)}"`);
    }
  }
  // Yes/No radio groups for auth & sponsorship
  for (const [re, yes] of [
    [/authori[sz]ed|legally|eligible/i, true],
    [/sponsor/i, !!p.needs_sponsorship],
  ] as [RegExp, boolean][]) {
    const radios = page.locator("input[type=radio]:visible");
    const n = await radios.count();
    for (let i = 0; i < n; i++) {
      const r = radios.nth(i);
      const name = (await r.getAttribute("name").catch(() => "")) ?? "";
      const lbl = await labelFor(page, r);
      const groupLabel = await page
        .locator(`[id*="${name}" i]`)
        .first()
        .textContent()
        .catch(() => "");
      if (re.test(`${lbl} ${groupLabel} ${name}`)) {
        if ((yes && /yes/i.test(lbl)) || (!yes && /no/i.test(lbl))) {
          await r.check().catch(() => {});
          log(`checked "${lbl.slice(0, 40)}"`);
        }
      }
    }
  }
}

async function answerQuestions(page: Page, answers: Answer[], log: (m: string) => void) {
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

async function labelFor(page: Page, el: Page): Promise<string> {
  const id = await el.getAttribute("id").catch(() => null);
  if (id) {
    const lbl = page.locator(`label[for="${id}"]`).first();
    if ((await lbl.count()) > 0) return (await lbl.textContent()) ?? "";
  }
  return (await el.getAttribute("aria-label").catch(() => null)) ?? (await el.getAttribute("placeholder").catch(() => null)) ?? "";
}

// If a verification-code prompt appears after submit, poll the user's inbox
// (via the email integration) for up to 2 minutes and enter the code.
async function handleVerificationCode(page: Page, log: (m: string) => void): Promise<boolean> {
  const codeInput = page
    .locator('input[name*="code" i]:visible, input[id*="code" i]:visible, input[autocomplete="one-time-code"]:visible, input[placeholder*="code" i]:visible')
    .first();
  if ((await codeInput.count()) === 0) return false;
  log("ATS is asking for an email verification code — checking your inbox…");
  const started = Date.now() - 60_000;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = await fetchVerificationCode(started);
    if (code) {
      await codeInput.fill(code).catch(() => {});
      log(`entered verification code ${code}`);
      const confirm = page
        .locator('button[type="submit"], button:has-text("Verify"), button:has-text("Confirm"), button:has-text("Continue")')
        .first();
      if ((await confirm.count()) > 0) await confirm.click().catch(() => {});
      const ok = await confirmSubmission(page, page.url(), true, log);
      if (ok) return true;
    }
    await page.waitForTimeout(15_000);
  }
  log("no verification code arrived in time — finish this one manually");
  return false;
}

const FORM_SEL =
  'form#application-form, form[action*="application" i], form:has(input[type="file"]), form:has(button[type="submit"])';

// Hard evidence only: a submission counts when the application form is gone
// or the URL moved to a confirmation page — never because the page merely
// contains words like "thank you" (job descriptions often do).
async function confirmSubmission(
  page: Page,
  beforeUrl: string,
  hadForm: boolean,
  log: (m: string) => void
): Promise<boolean> {
  await page.waitForTimeout(5000);

  const validationError = await page
    .locator(
      "text=/required|can't be blank|please (select|complete|fill|choose)|fix the errors|invalid/i"
    )
    .first()
    .isVisible()
    .catch(() => false);

  if (validationError) {
    log("validation errors remain — application was NOT submitted");
    return false;
  }

  const currentUrl = page.url();
  const urlChanged = currentUrl !== beforeUrl;

  const confirmationText = await page
    .locator(
      "text=/application (has been )?(submitted|received)|thank you for applying|thanks for applying|we have received your application|application complete|submission confirmed/i"
    )
    .first()
    .isVisible()
    .catch(() => false);

  const confirmationUrl =
    urlChanged &&
    /confirmation|application-submitted|application-complete|thank-you|success/i.test(
      currentUrl
    );

  const formStillVisible = hadForm
    ? await page.locator(FORM_SEL).first().isVisible().catch(() => false)
    : false;

  // Require explicit external evidence. A disappearing form by itself is not
  // enough because SPA navigation and modal changes can hide forms.
  if (confirmationText && (confirmationUrl || !formStillVisible)) {
    log(`verified submission confirmation at ${currentUrl}`);
    return true;
  }

  log(
    `submission could not be verified — URL: ${currentUrl}; confirmation text: ${confirmationText}; form visible: ${formStillVisible}`
  );
  return false;
}

async function submit(page: Page, log: (m: string) => void): Promise<boolean> {
  const btn = page
    .locator('button[type="submit"], input[type="submit"], button:has-text("Submit application"), button:has-text("Submit Application")')
    .first();
  if ((await btn.count()) === 0) {
    log("no submit button found");
    return false;
  }
  const beforeUrl = page.url();
  const hadForm = (await page.locator(FORM_SEL).count()) > 0;
  await btn.click();
  log("clicked submit");
  try {
    await page.waitForURL((u: URL) => /confirmation|thank/i.test(u.href), { timeout: 12000 });
    log("confirmation URL reached");
    return true;
  } catch {
    return await confirmSubmission(page, beforeUrl, hadForm, log);
  }
}
