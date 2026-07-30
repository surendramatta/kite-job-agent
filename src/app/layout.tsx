import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { getDb } from "@/lib/db";
import { appliedTodayCount, getPreferences } from "@/lib/matching";

export const metadata: Metadata = {
  title: "Kite — your job hunt, on autopilot",
  description: "Private, self-hosted AI job application agent. Your data never leaves your machine.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const prefs = getPreferences();
  const left = Math.max(0, prefs.dailyLimit - appliedTodayCount());
  const unread = (
    getDb().prepare("SELECT COUNT(*) n FROM inbox_messages WHERE read = 0 AND direction = 'inbound'").get() as { n: number }
  ).n;

  return (
    <html lang="en">
      <body className="min-h-screen" suppressHydrationWarning>
        <div className="flex">
          <Nav creditsLeft={left} unread={unread} />
          <main className="flex-1 min-w-0 px-6 py-6 max-w-6xl mx-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
