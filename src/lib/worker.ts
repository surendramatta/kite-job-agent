// Kite's background agent: refreshes the job feed, auto-queues matches on
// autopilot, and drives the in-app apply bot — no terminal commands needed.
import { getDb, getSetting, setSetting, logEvent, Job } from "./db";
import { refreshAllSources, DEFAULT_WATCHLIST } from "./sources";
import { computeMatch, getDefaultResumeContent, getPreferences, isExcluded, appliedTodayCount } from "./matching";
import { processApplyQueue } from "./applybot";
import { prepareAndMaybeApprove } from "./actions-core";
import { syncEmails } from "./emailsync";

const TICK_MS = 60_000;
const REFRESH_EVERY_MS = 30 * 60_000;
const EMAIL_EVERY_MS = 5 * 60_000;

const g = globalThis as unknown as { __kiteWorker?: { timer: ReturnType<typeof setInterval>; busy: boolean } };

export function ensureWorker() {
  if (g.__kiteWorker) return;
  const state = { timer: setInterval(() => void tick(), TICK_MS), busy: false };
  state.timer.unref?.();
  g.__kiteWorker = state;
  setTimeout(() => void tick(), 3000).unref?.();
}

export async function tick(force = false) {
  const state = g.__kiteWorker;
  if (state?.busy) return;
  if (state) state.busy = true;
  try {
    const autopilot = getSetting("autopilot_enabled", "0") === "1";

    // Email sync runs regardless of autopilot.
    const lastMail = Date.parse(getSetting("email_last_sync") || "0") || 0;
    if (force || Date.now() - lastMail > EMAIL_EVERY_MS) {
      const { error } = await syncEmails();
      setSetting("email_last_error", error ?? "");
    }

    if (!autopilot && !force) {
      // Even without autopilot, keep submitting applications the user approved.
      await runAgent();
      return;
    }

    // 1. Refresh the feed periodically.
    const last = Date.parse(getSetting("last_refresh") || "0") || 0;
    if (force || Date.now() - last > REFRESH_EVERY_MS) {
      const prefs = getPreferences();
      const enabled = (k: string) => getSetting(k, "1") !== "0";
      try {
        await refreshAllSources({
          remotive: enabled("src_remotive"),
          arbeitnow: enabled("src_arbeitnow"),
          remoteok: enabled("src_remoteok"),
          search: prefs.roles[0] ?? getDefaultResumeContent()?.skills?.[0] ?? "",
          watchlist: getSetting("watch_companies", DEFAULT_WATCHLIST),
          adzuna: { appId: getSetting("adzuna_app_id"), appKey: getSetting("adzuna_app_key"), where: getSetting("pref_locations").split(",")[0] ?? "" },
    jsearch: { key: getSetting("jsearch_key"), where: getSetting("pref_locations").split(",")[0] ?? "" },
    careerjet: { affid: getSetting("careerjet_affid"), where: getSetting("pref_locations").split(",")[0] ?? "" },
        });
        setSetting("last_refresh", new Date().toISOString());
      } catch {}
    }

    if (autopilot) await autopilotPass();
    await runAgent();
    setSetting("agent_last_tick", new Date().toISOString());
  } finally {
    if (state) state.busy = false;
  }
}

// Score fresh jobs; anything at/above the threshold gets prepared. In
// hands-off mode it's auto-approved for submission, otherwise it lands in
// Review Required.
async function autopilotPass() {
  const db = getDb();
  const prefs = getPreferences();
  const resume = getDefaultResumeContent();
  if (!resume) return;

  const budget = prefs.dailyLimit - appliedTodayCount();
  if (budget <= 0) return;

  const handsOff = getSetting("autopilot_hands_off", "0") === "1";
  const candidates = db
    .prepare(
      `SELECT j.* FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE j.hidden = 0 AND a.id IS NULL
       ORDER BY j.fetched_at DESC LIMIT 150`
    )
    .all() as Job[];

  // Score everything first, take the BEST matches, and cap per company so
  // one big job board doesn't eat the whole daily budget.
  const scored = candidates
    .filter((j) => !isExcluded(j, prefs))
    .map((job) => ({ job, score: computeMatch(job, resume, prefs).score }))
    .filter((x) => x.score >= prefs.minMatchScore)
    .sort((a, b) => b.score - a.score);

  const perCompany = new Map<string, number>();
  const todayByCompany = db
    .prepare(
      `SELECT j.company c, COUNT(*) n FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.created_at >= datetime('now','start of day') GROUP BY j.company`
    )
    .all() as { c: string; n: number }[];
  for (const r of todayByCompany) perCompany.set(r.c.toLowerCase(), r.n);

  let taken = 0;
  for (const { job, score } of scored) {
    if (taken >= Math.min(budget, 10)) break;
    const key = job.company.toLowerCase();
    if ((perCompany.get(key) ?? 0) >= 2) continue;
    try {
      const appId = await prepareAndMaybeApprove(job.id, handsOff);
      if (appId) {
        logEvent(appId, "autopilot", `matched ${score}% — ${handsOff ? "auto-approved" : "queued for your review"}`);
        perCompany.set(key, (perCompany.get(key) ?? 0) + 1);
        taken++;
      }
    } catch {}
  }
}

async function runAgent() {
  const { error } = await processApplyQueue({ limit: 5 });
  if (error) setSetting("agent_last_error", error);
  else setSetting("agent_last_error", "");
}
