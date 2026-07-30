# 🪁 Kite — your job hunt, on autopilot

Kite is a private, self-hosted AI job-application agent. It finds roles that
fit you, tailors your résumé and cover letter for each one, fills the
application form, and submits — automatically on autopilot, or with your
approval on every send. Everything runs on your machine; your résumé and
history live in a local SQLite file and never touch anyone else's server.

Inspired by tools like Tsenta, built to beat them:

| | Kite | Typical auto-apply SaaS |
|---|---|---|
| Price | **$0, unlimited** | $19–99/mo for credits |
| Your data | **stays on your machine** | their cloud |
| Auto-submit | ✅ in-app agent (Greenhouse/Lever) | ✅ |
| Approve-before-send with résumé diff | ✅ | varies |
| Receipts for every application | ✅ | ✅ |
| Insights (response rate, follow-up nudges) | ✅ | rarely |
| Standing rules ("What Kite remembers") | ✅ | varies |

## Quick start

```bash
npm install          # also downloads the agent's browser (Chromium)
npm run seed         # optional: demo data
npm run dev          # open http://localhost:3000
```

First launch walks you through onboarding:

1. **Upload your résumé (PDF)** — Kite parses it into the editor, fills your
   profile contact fields, and keeps the original file to upload into ATS
   forms.
2. **Five questions** — target roles, location/remote, minimum salary,
   experience level, work authorization.
3. Done — your match feed starts filling.

## How the autopilot works

Turn it on in **Settings → Autopilot**. While the app is running, Kite:

- refreshes the job feed every 30 minutes (Remotive, Arbeitnow, RemoteOK —
  free public APIs — plus anything you paste by URL),
- scores every new job against your résumé + preferences,
- prepares a tailored résumé, cover letter and form answers for each job at
  or above your minimum match %,
- and submits Greenhouse/Lever applications with its built-in browser agent —
  respecting your daily limit.

Two safety levels:

- **Default:** prepared applications wait in *Review Required* — you see the
  résumé diff, the exact fields, and the cover letter, then hit
  *Approve & send*.
- **Fully hands-off:** skip review; Kite sends automatically. There's also a
  *dry-run* mode where the agent fills forms but never clicks submit.

Every submission gets a **receipt**: exactly what was sent, via which ATS,
with a timeline. Replies you log in the **Inbox** thread onto the right
application and move its status. The **Tracker** shows your funnel
(Applied → Interviewing → Offer) and nudges you when an application has gone
a week without a reply.

## The personal touches

- A greeting that knows your name and your week's momentum
- Response-rate and in-flight stats on the dashboard
- Follow-up nudges so nothing gets ghosted silently
- "What Kite remembers" — standing rules honored in every cover letter
- Optional Claude API key for letters written in your voice (falls back to a
  solid local engine without one)

## CLI extras

```bash
npm run refresh-jobs   # cron-able feed refresh
npm run apply-bot -- --dry-run --headed   # watch the agent work, no submits
```

## Tech

Next.js 15 · React 19 · Tailwind 4 · SQLite (better-sqlite3) · Playwright ·
pdf-parse. Databases from earlier versions migrate automatically.

## A note on responsibility

Kite applies as *you*, on your own applications. Keep the daily limit humane,
review what goes out (at least at first), and spot-check receipts — it's your
name on every application.

## Production deployment (Docker)

Kite now ships with a separate web process and Playwright worker. This avoids
running browser automation inside the Next.js request lifecycle and works on an
older Mac because Chromium runs inside the container.

```bash
cp .env.example .env
# Replace both values with output from: openssl rand -hex 32
docker compose up -d --build
```

Open `http://localhost:3000`. Persistent application data is stored in the
`kite_data` Docker volume. Check service health at `/api/health`.

For a public server, place Caddy, Nginx, or Cloudflare Tunnel in front of port
3000 and enable HTTPS. Do not expose the internal worker endpoint; it requires
`KITE_WORKER_SECRET` and is called only by the worker container.

### What changed for production

- Playwright runs in Microsoft's version-matched Linux image.
- The browser worker is a separate long-running container.
- Queue rows are atomically leased to prevent duplicate submissions.
- Crashed leases return to the queue after 15 minutes.
- Each application receives an isolated browser context.
- Authentication uses scrypt password hashing and signed, HTTP-only cookies.
- Health checks report database and worker status.
- Local data paths can be configured with `KITE_DATA_DIR`.

### Public multi-user status

This release is a deployable **single-account beta**. It is safe for one person
or one trusted household/team instance. Do not advertise one shared deployment
to unrelated users yet: profiles, settings, files, and application history still
belong to the instance rather than separate accounts.

The correct next milestone for a public SaaS is tenant isolation using
PostgreSQL/Supabase Auth and private object storage, or one isolated Kite
container and volume per account. Publishing the current shared database as a
multi-user service would expose personal résumé and application data.
