"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "ホーム", icon: "⌂" },
  { href: "/calendar", label: "履歴", icon: "▦" },
  { href: "/settings", label: "お薬・設定", icon: "⚙" },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="absolute bottom-0 z-50 flex h-16 w-full items-center border-t border-sky-100 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href} className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold ${active ? "bg-sky-50 text-sky-600 dark:bg-slate-700 dark:text-sky-300" : "text-slate-400"}`}>
            <span className="text-xl leading-none" aria-hidden>{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

