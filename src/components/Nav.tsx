"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Launchpad", icon: "🪁" },
  { href: "/browse", label: "Discover", icon: "🔭" },
  { href: "/tracker", label: "Flights", icon: "🛫" },
  { href: "/inbox", label: "Mail", icon: "📮" },
  { href: "/resumes", label: "Resume", icon: "📄" },
  { href: "/profile", label: "You", icon: "🙂" },
  { href: "/settings", label: "Controls", icon: "🎛" },
];

export default function Nav({ creditsLeft, unread }: { creditsLeft: number; unread: number }) {
  const pathname = usePathname();
  return (
    <aside className="no-print w-52 shrink-0 sticky top-0 h-screen flex flex-col border-r border-[var(--border)] bg-white/60 backdrop-blur px-3 py-5">
      <Link href="/dashboard" className="flex items-center gap-2 px-3 mb-1">
        <span className="text-2xl leading-none">🪁</span>
        <span className="font-extrabold text-xl tracking-tight">kite</span>
      </Link>
      <p className="px-3 mb-5 text-[0.65rem] font-semibold text-[var(--coral)] tracking-wide">
        your job hunt, on autopilot
      </p>
      <nav className="space-y-1 flex-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`side-item ${active ? "side-item-active" : ""}`}>
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
              {item.href === "/inbox" && unread > 0 && (
                <span className="ml-auto bg-[var(--coral)] text-white text-[0.62rem] font-bold rounded-full px-1.5 py-0.5">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pt-4 border-t border-[var(--border)] space-y-1">
        <div className="text-sm font-bold">✦ {creditsLeft} flights left today</div>
        <div className="hint">self-hosted · free forever · your data stays home</div>
      </div>
    </aside>
  );
}
