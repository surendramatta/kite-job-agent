// Email sync: connects to the user's own mailbox over IMAP, pulls ATS
// confirmations and recruiter replies, threads them onto the right
// application, and moves statuses — Kite's answer to Tsenta's managed email.
import { getDb, getSetting, setSetting, logEvent } from "./db";

type Classified = { category: string; status: string | null };

function classify(subject: string, body: string): Classified {
  const t = `${subject}\n${body}`.toLowerCase();
  if (/unfortunately|not (be )?moving forward|other candidates|decided to (pursue|proceed with)|no longer under consideration|regret to/i.test(t))
    return { category: "rejection", status: "rejected" };
  if (/offer letter|pleased to offer|extend an offer/.test(t)) return { category: "offer", status: "offer" };
  if (/interview|schedule (a )?(call|meeting|chat)|availability|calendly|phone screen/.test(t))
    return { category: "interview", status: "interviewing" };
  if (/assessment|coding (test|challenge)|take-home|hackerrank|codesignal/.test(t))
    return { category: "assessment", status: "needs_you" };
  if (/verify|confirm your email|activation/.test(t)) return { category: "verification", status: null };
  if (/thank you for (applying|your (application|interest))|application (received|submitted|confirmation)|we('ve| have) received your application/.test(t))
    return { category: "applied", status: null };
  return { category: "", status: null };
}

// Match an email to a tracked application by company name appearing in the
// sender, subject or body.
function matchApplication(from: string, subject: string, body: string): number | null {
  const db = getDb();
  const apps = db
    .prepare(
      `SELECT a.id, j.company FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.status IN ('submitted','in_flight','needs_you','interviewing','offer','ghosted')
       ORDER BY a.updated_at DESC`
    )
    .all() as { id: number; company: string }[];
  const hay = `${from}\n${subject}\n${body.slice(0, 2000)}`.toLowerCase();
  for (const app of apps) {
    const company = app.company.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (company.length >= 3 && hay.includes(company)) return app.id;
    const token = company.split(" ")[0];
    if (token.length >= 5 && hay.includes(token)) return app.id;
  }
  return null;
}

// Fetch a fresh verification/OTP code from the user's inbox — used by the
// apply agent when an ATS emails a confirmation code mid-application.
export async function fetchVerificationCode(sinceMs: number): Promise<string | null> {
  const host = getSetting("email_imap_host");
  const user = getSetting("email_imap_user");
  const pass = getSetting("email_imap_pass");
  if (!host || !user || !pass) return null;
  try {
    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");
    const client = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false });
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let code: string | null = null;
    try {
      const uids = await client.search({ since: new Date(sinceMs) }, { uid: true });
      for (const uid of (uids || []).slice(-10).reverse()) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const text = `${parsed.subject ?? ""}\n${parsed.text ?? ""}`;
        if (!/verif|confirm|code|one[- ]time|otp|security/i.test(text)) continue;
        const m = text.match(/\b(\d{4,8})\b/);
        if (m) {
          code = m[1];
          break;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return code;
  } catch {
    return null;
  }
}

export async function syncEmails(): Promise<{ imported: number; error?: string }> {
  const host = getSetting("email_imap_host");
  const user = getSetting("email_imap_user");
  const pass = getSetting("email_imap_pass");
  if (getSetting("email_enabled", "0") !== "1" || !host || !user || !pass) {
    return { imported: 0 };
  }

  let ImapFlow, simpleParser;
  try {
    ({ ImapFlow } = await import("imapflow"));
    ({ simpleParser } = await import("mailparser"));
  } catch {
    return { imported: 0, error: "email libraries missing — reinstall dependencies" };
  }

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const db = getDb();
  let imported = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const lastUid = parseInt(getSetting("email_last_uid", "0"), 10) || 0;
      const mailbox = client.mailbox as { uidNext?: number };
      const uidNext = mailbox?.uidNext ?? 1;
      // First run: only look at the most recent ~50 messages.
      const startUid = lastUid > 0 ? lastUid + 1 : Math.max(1, uidNext - 50);
      if (startUid >= uidNext) return { imported: 0 };

      for await (const msg of client.fetch(`${startUid}:*`, { uid: true, source: true }, { uid: true })) {
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.text ?? "";
          const subject = parsed.subject ?? "";
          const body = (parsed.text ?? "").trim().slice(0, 5000);
          const appId = matchApplication(from, subject, body);
          if (appId) {
            const { category, status } = classify(subject, body);
            const dup = db
              .prepare("SELECT id FROM inbox_messages WHERE application_id = ? AND subject = ? AND body = ?")
              .get(appId, subject, body);
            if (!dup) {
              db.prepare(
                "INSERT INTO inbox_messages (application_id, direction, from_name, subject, body, category) VALUES (?, 'inbound', ?, ?, ?, ?)"
              ).run(appId, from.split("<")[0].trim(), subject, body, category);
              if (status) {
                db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, appId);
                logEvent(appId, "email", `${category || "reply"} → ${status}`);
              } else if (category === "applied") {
                // ATS confirmation email = proof of submission.
                db.prepare(
                  "UPDATE applications SET status = 'submitted', notes = '', applied_at = COALESCE(applied_at, datetime('now')), updated_at = datetime('now') WHERE id = ? AND status IN ('in_flight','needs_you')"
                ).run(appId);
                logEvent(appId, "email", "ATS confirmation received → Submitted");
              } else {
                logEvent(appId, "email", category || "reply received");
              }
              imported++;
            }
          }
          if (msg.uid) setSetting("email_last_uid", String(msg.uid));
        } catch {}
      }
    } finally {
      lock.release();
    }
    await client.logout();
    setSetting("email_last_sync", new Date().toISOString());
    return { imported };
  } catch (e) {
    try {
      await client.logout();
    } catch {}
    return { imported, error: (e as Error).message.split("\n")[0] };
  }
}
