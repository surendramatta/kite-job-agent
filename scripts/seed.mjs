#!/usr/bin/env node
// Demo seed: sample jobs + a starter resume so every screen has data offline.
import { openDb } from "./lib-db.mjs";

const db = openDb();

const jobs = [
  {
    source: "seed", external_id: "seed-1", title: "Senior Frontend Engineer", company: "Nimbus Labs",
    location: "Remote (US)", remote: 1, salary: "$150k–$185k", job_type: "full_time",
    tags: ["react", "typescript", "next js"], ats_kind: "greenhouse",
    url: "https://boards.greenhouse.io/example/jobs/1111",
    description: `We are looking for a Senior Frontend Engineer to build our design system and customer dashboard.

Requirements:
• 5+ years with React and TypeScript
• Experience with Next js and state management
• Strong CSS, responsive design, accessibility
• Experience with testing (unit testing, integration testing)
• GraphQL API consumption experience
• CI CD pipelines, code review culture

Nice to have: Node js, PostgreSQL, AWS.`,
  },
  {
    source: "seed", external_id: "seed-2", title: "Full Stack Developer", company: "Orbit Analytics",
    location: "Berlin, Germany", remote: 0, salary: "€70k–€90k", job_type: "full_time",
    tags: ["node js", "react", "postgresql"], ats_kind: "lever",
    url: "https://jobs.lever.co/example/2222",
    description: `Orbit Analytics builds business intelligence tooling for mid-market retailers.

You will:
• Ship features across React frontend and Node js backend
• Design REST APIs and data models in PostgreSQL
• Own deployments on Amazon Web Services with Docker and Kubernetes
• Collaborate cross functional with product and design

Requirements: 3+ years full stack, JavaScript, TypeScript, SQL, Git.`,
  },
  {
    source: "seed", external_id: "seed-3", title: "Machine Learning Engineer", company: "Vector Byte",
    location: "Remote (Worldwide)", remote: 1, salary: "$160k–$210k", job_type: "full_time",
    tags: ["python", "machine learning", "pytorch"], ats_kind: "",
    url: "https://example.com/careers/ml-engineer",
    description: `Vector Byte is hiring a Machine Learning Engineer for our recommendation platform.

Requirements:
• Strong Python and PyTorch experience
• Production machine learning and deep learning systems
• Data engineering with Spark and Airflow
• Natural language processing experience a plus
• Docker, Kubernetes, Amazon Web Services`,
  },
  {
    source: "seed", external_id: "seed-4", title: "Product Designer", company: "Halcyon",
    location: "Remote (EU)", remote: 1, salary: "", job_type: "full_time",
    tags: ["figma", "ux design", "design systems"], ats_kind: "ashby",
    url: "https://jobs.ashbyhq.com/example/4444",
    description: `Halcyon is looking for a Product Designer to own end-to-end user experience.

You will work on design systems, prototypes in Figma, user research and usability testing.
Requirements: 4+ years product design, portfolio of shipped work, ux design and ui design craft,
experience collaborating cross functional with engineers.`,
  },
  {
    source: "seed", external_id: "seed-5", title: "DevOps Engineer", company: "Cloudmesh",
    location: "Remote (US)", remote: 1, salary: "$140k–$175k", job_type: "full_time",
    tags: ["kubernetes", "terraform", "aws"], ats_kind: "greenhouse",
    url: "https://boards.greenhouse.io/example/jobs/5555",
    description: `Cloudmesh runs infrastructure for fintech startups.

Requirements:
• Kubernetes, Terraform, Amazon Web Services
• CI CD pipeline design (GitHub Actions, ArgoCD)
• Python or Go scripting
• Monitoring with Prometheus and Grafana
• Site reliability mindset, incident response`,
  },
];

const insert = db.prepare(`
  INSERT INTO jobs (source, external_id, title, company, location, remote, salary, job_type, tags_json, description, url, posted_at, ats_kind)
  VALUES (@source, @external_id, @title, @company, @location, @remote, @salary, @job_type, @tags_json, @description, @url, @posted_at, @ats_kind)
  ON CONFLICT(source, external_id) DO NOTHING
`);

let n = 0;
for (const j of jobs) {
  n += insert.run({
    ...j,
    tags_json: JSON.stringify(j.tags),
    posted_at: new Date(Date.now() - Math.random() * 5 * 864e5).toISOString(),
  }).changes;
}
console.log(`Seeded ${n} demo jobs.`);

const hasResume = db.prepare("SELECT COUNT(*) n FROM resumes").get().n > 0;
if (!hasResume) {
  db.prepare("INSERT INTO resumes (name, is_default, content_json) VALUES (?, 1, ?)").run(
    "Starter resume",
    JSON.stringify({
      summary:
        "Full stack engineer with 6 years of experience building web applications with React, TypeScript and Node.js. Focused on shipping fast, accessible products.",
      skills: ["React", "TypeScript", "Node.js", "Next.js", "PostgreSQL", "GraphQL", "Docker", "AWS", "CSS", "Testing"],
      experience: [
        {
          title: "Senior Software Engineer", company: "Acme SaaS", start: "2022", end: "Present",
          bullets: [
            "Led migration of customer dashboard to Next.js and TypeScript, cutting page load times 40%",
            "Built GraphQL API layer over PostgreSQL serving 2M requests/day",
            "Introduced unit testing and CI CD pipelines, raising coverage from 15% to 80%",
          ],
        },
        {
          title: "Software Engineer", company: "Startly", start: "2019", end: "2022",
          bullets: [
            "Shipped React component library used across 4 product teams",
            "Implemented REST APIs in Node js with responsive design frontends",
          ],
        },
      ],
      education: [{ school: "State University", degree: "B.S. Computer Science", year: "2019" }],
    })
  );
  console.log("Seeded starter resume (edit it in Resumes).");
}
// Demo application with a receipt + recruiter reply so the tracker, receipt
// and inbox screens show the full experience.
const hasApps = db.prepare("SELECT COUNT(*) n FROM applications").get().n > 0;
if (!hasApps) {
  const job = db.prepare("SELECT id FROM jobs WHERE external_id = 'seed-2'").get();
  if (job) {
    const receipt = {
      fields: [
        { label: "Full name", value: "Your Name" },
        { label: "Email", value: "you@example.com" },
        { label: "Work authorization", value: "US Citizen" },
        { label: "Requires sponsorship", value: "No" },
      ],
      answers: [
        { question: "Years of experience with React?", answer: "6" },
        { question: "Why Orbit Analytics?", answer: "I love building analytics tools that non-technical teams actually use." },
      ],
      resume_name: "Starter resume (tailored for Orbit Analytics)",
      cover_letter_included: true,
      submitted_via: "lever",
      confirmation: "Application received — Lever confirmation #38271",
      submitted_at: new Date(Date.now() - 2 * 864e5).toISOString(),
    };
    const info = db
      .prepare(
        `INSERT INTO applications (job_id, status, ats_score, cover_letter, receipt_json, applied_at, created_at)
         VALUES (?, 'needs_you', 72, ?, ?, datetime('now','-2 days'), datetime('now','-2 days'))`
      )
      .run(
        job.id,
        "Dear Orbit Analytics Hiring Team,\n\n(Example cover letter — approve-before-send means the real one is always shown to you first.)\n\nSincerely,\nYour Name",
        JSON.stringify(receipt)
      );
    const appId = info.lastInsertRowid;
    db.prepare("INSERT INTO app_events (application_id, event, detail, created_at) VALUES (?, 'approved', 'application sent', datetime('now','-2 days'))").run(appId);
    db.prepare(
      `INSERT INTO inbox_messages (application_id, direction, from_name, subject, body, created_at)
       VALUES (?, 'inbound', 'Lena from Orbit', 'Next steps', 'Thanks for applying! Are you free for a 30-minute intro call this week?', datetime('now','-1 day'))`
    ).run(appId);
    console.log("Seeded a demo sent application with receipt + recruiter reply.");
  }
}
console.log("Done. Start the app: npm run dev");
