import { getSetting } from "@/lib/db";
import { saveSettings } from "@/lib/actions";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "autopilot", label: "Autopilot" },
  { id: "apply", label: "Apply settings" },
  { id: "email", label: "Email integration" },
  { id: "remembers", label: "What Kite remembers" },
  { id: "sources", label: "Job sources" },
  { id: "ai", label: "AI (Claude API)" },
  { id: "plan", label: "Plans & billing" },
];

export default function SettingsPage() {
  return (
    <div className="grid md:grid-cols-[14rem_1fr] gap-8 max-w-4xl">
      <aside className="md:sticky md:top-24 self-start">
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="hint mb-4">Manage your account and integrations</p>
        <nav className="space-y-1">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block px-3 py-2 rounded-xl text-sm font-semibold hover:bg-[var(--panel-2)]">
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <form action={saveSettings} className="space-y-6">
        <section id="autopilot" className="panel p-6 !rounded-2xl space-y-4 border-2 !border-[var(--pine)]/30">
          <h2 className="font-bold">🪁 Autopilot</h2>
          <p className="hint">
            When on, Kite runs in the background while the app is open: refreshes the feed every 30
            minutes, prepares applications for every job at or above your minimum match %, and the
            in-app agent submits approved Greenhouse/Lever applications automatically — all within
            your daily limit.
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="autopilot_enabled" defaultChecked={getSetting("autopilot_enabled") === "1"} />
            Enable autopilot
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="autopilot_hands_off" defaultChecked={getSetting("autopilot_hands_off") === "1"} />
            Fully hands-off — skip my review and send automatically (otherwise matches wait in
            &quot;Review Required&quot;)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="agent_dry_run" defaultChecked={getSetting("agent_dry_run") === "1"} />
            Dry-run mode — the agent fills forms but never clicks submit (good for testing)
          </label>
          <div>
            <span className="label">Resume PDF the agent uploads with applications</span>
            <input
              name="resume_pdf_path"
              className="input"
              defaultValue={getSetting("resume_pdf_path")}
              placeholder="Set automatically when you upload a resume — or paste an absolute path"
            />
          </div>
          <p className="hint">
            One-time setup on your machine: <code className="bg-[var(--panel-2)] px-1.5 py-0.5 rounded">npx playwright install chromium</code>
          </p>
        </section>

        <section id="apply" className="panel p-6 !rounded-2xl space-y-4">
          <h2 className="font-bold">Apply settings</h2>
          <div>
            <span className="label">Target roles (comma separated)</span>
            <input name="pref_roles" className="input" defaultValue={getSetting("pref_roles")} placeholder="frontend engineer, full stack" />
          </div>
          <div>
            <span className="label">Locations</span>
            <input name="pref_locations" className="input" defaultValue={getSetting("pref_locations")} placeholder="empty = anywhere" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="label">Min salary</span>
              <input name="pref_salary_min" type="number" className="input" defaultValue={getSetting("pref_salary_min")} />
            </div>
            <div>
              <span className="label">Experience level</span>
              <select name="pref_experience" className="select" defaultValue={getSetting("pref_experience")}>
                <option value="">Any</option>
                <option value="entry">Entry</option>
                <option value="mid">Mid</option>
                <option value="senior">Senior</option>
                <option value="staff">Staff+</option>
              </select>
            </div>
            <div className="flex items-end pb-2 flex-col items-start gap-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="pref_remote_only" defaultChecked={getSetting("pref_remote_only") === "1"} />
                Remote only
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="pref_usa_only" defaultChecked={getSetting("pref_usa_only", "1") !== "0"} />
                🇺🇸 USA jobs only
              </label>
            </div>
          </div>
          <div>
            <span className="label">Exclude keywords</span>
            <input name="pref_exclude_keywords" className="input" defaultValue={getSetting("pref_exclude_keywords")} placeholder="intern, unpaid, clearance" />
          </div>
          <div>
            <span className="label">Exclude companies</span>
            <input name="pref_exclude_companies" className="input" defaultValue={getSetting("pref_exclude_companies")} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="label">Daily send limit</span>
              <input name="aa_daily_limit" type="number" min={1} className="input" defaultValue={getSetting("aa_daily_limit", "25")} />
            </div>
            <div>
              <span className="label">Min match % to surface</span>
              <input name="pref_min_match" type="number" min={0} max={100} className="input" defaultValue={getSetting("pref_min_match", "50")} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="pref_needs_sponsorship" defaultChecked={getSetting("pref_needs_sponsorship") === "1"} />
                Flag no-sponsorship postings
              </label>
            </div>
          </div>
        </section>

        <section id="email" className="panel p-6 !rounded-2xl space-y-3">
          <h2 className="font-bold">📬 Email integration</h2>
          <p className="hint">
            Connect your inbox and Kite auto-imports ATS confirmations and recruiter replies: each
            email lands on the right application in your Inbox, and statuses move on their own
            (rejection → Rejected, interview invite → Interviewing, offer → Offer). Checked every 5
            minutes. Credentials stay in your local database.
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="email_enabled" defaultChecked={getSetting("email_enabled") === "1"} />
            Enable email sync
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">IMAP host</span>
              <input name="email_imap_host" className="input" defaultValue={getSetting("email_imap_host")} placeholder="imap.gmail.com" />
            </div>
            <div>
              <span className="label">Email address</span>
              <input name="email_imap_user" className="input" defaultValue={getSetting("email_imap_user")} placeholder="you@gmail.com" />
            </div>
            <div className="col-span-2">
              <span className="label">App password</span>
              <input name="email_imap_pass" type="password" className="input" defaultValue={getSetting("email_imap_pass")} placeholder="For Gmail: create one at myaccount.google.com/apppasswords" />
            </div>
          </div>
          {getSetting("email_last_error") && (
            <p className="hint !text-[var(--red)]">Last sync error: {getSetting("email_last_error")}</p>
          )}
          {getSetting("email_last_sync") && !getSetting("email_last_error") && (
            <p className="hint !text-[var(--green)]">
              Last synced {new Date(getSetting("email_last_sync")).toLocaleString()}
            </p>
          )}
        </section>

        <section id="remembers" className="panel p-6 !rounded-2xl space-y-3">
          <h2 className="font-bold">What Kite remembers</h2>
          <p className="hint">
            Standing rules applied to every cover letter and application — say &quot;always&quot; or
            &quot;never&quot; and it sticks. (Used directly in AI cover-letter generation.)
          </p>
          <textarea
            name="tsenta_rules"
            className="textarea"
            rows={4}
            defaultValue={getSetting("tsenta_rules")}
            placeholder={"e.g. Always mention my TikTok Ads certification.\nNever apply to gambling companies.\nKeep cover letters under 200 words."}
          />
        </section>

        <section id="sources" className="panel p-6 !rounded-2xl space-y-3">
          <h2 className="font-bold">Job sources</h2>
          {(
            [
              ["src_remotive", "Remotive — remote jobs, searchable by your target role"],
              ["src_arbeitnow", "Arbeitnow — EU-heavy job board"],
              ["src_remoteok", "RemoteOK — remote tech jobs"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={key} defaultChecked={getSetting(key, "1") !== "0"} />
              {label}
            </label>
          ))}
          <p className="hint">
            Plus Jobicy and Himalayas (always on) — free public APIs, and paste any URL on Discover.
          </p>
          <div>
            <span className="label">JSearch key — LinkedIn / Indeed / Glassdoor / ZipRecruiter listings</span>
            <input name="jsearch_key" type="password" className="input" defaultValue={getSetting("jsearch_key")} placeholder="Free key: rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" />
            <p className="hint mt-1">
              These boards have no public API of their own. JSearch indexes them legally and returns
              the direct company apply link when there is one — which is what Kite&apos;s agent needs.
            </p>
          </div>
          <div>
            <span className="label">Careerjet affiliate ID (free, worldwide listings)</span>
            <input name="careerjet_affid" className="input" defaultValue={getSetting("careerjet_affid")} placeholder="Free at partners.careerjet.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">Adzuna App ID (optional — millions more jobs, incl. on-site)</span>
              <input name="adzuna_app_id" className="input" defaultValue={getSetting("adzuna_app_id")} placeholder="free key at developer.adzuna.com" />
            </div>
            <div>
              <span className="label">Adzuna App Key</span>
              <input name="adzuna_app_key" type="password" className="input" defaultValue={getSetting("adzuna_app_key")} />
            </div>
          </div>
          <div>
            <span className="label">Company watchlist (direct from Greenhouse/Lever — the agent can auto-submit these)</span>
            <textarea
              name="watch_companies"
              className="textarea !text-xs"
              rows={4}
              defaultValue={getSetting("watch_companies")}
              placeholder="Empty = Kite's built-in list of 45+ companies. Format: gh:slug, lever:slug, ashby:slug, smartrecruiters:slug, recruitee:slug — comma separated. Find the slug in the careers URL."
            />
            <p className="hint mt-1">
              <b>This is how you beat LinkedIn to a posting.</b> Kite reads these companies&apos;
              career systems directly (Greenhouse, Lever, Ashby, SmartRecruiter, Recruitee), where
              roles appear hours to days before they are syndicated to job boards — and every one of
              them is fully auto-submittable by the agent.
            </p>
          </div>
        </section>

        <section id="ai" className="panel p-6 !rounded-2xl space-y-3">
          <h2 className="font-bold">AI — Claude API (optional)</h2>
          <p className="hint">
            With an Anthropic API key, cover letters are written by Claude in your voice (and your
            standing rules above are honored). Without it, the built-in engine is used. Stored only
            in your local database.
          </p>
          <input
            name="anthropic_api_key"
            type="password"
            className="input"
            defaultValue={getSetting("anthropic_api_key")}
            placeholder="sk-ant-…"
          />
        </section>

        <section id="plan" className="panel p-6 !rounded-2xl space-y-2">
          <h2 className="font-bold">Plans &amp; billing</h2>
          <div className="flex items-center gap-2">
            <span className="font-bold text-2xl">$0</span>
            <span className="status status-submitted">Self-hosted</span>
          </div>
          <p className="hint">
            Unlimited applications, forever. No credits, no billing — this is your own instance and
            your data never leaves your machine.
          </p>
        </section>

        <button className="btn btn-dark btn-lg">Save settings</button>
      </form>
    </div>
  );
}
