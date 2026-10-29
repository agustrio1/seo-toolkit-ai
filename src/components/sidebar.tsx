"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderGit2,
  KeyRound,
  ScanSearch,
  Layers,
  PenSquare,
  Tags,
  Bot,
  SearchCode,
  Link2,
  Sparkles,
  FileBarChart,
  History,
  Activity,
  Settings,
  LogOut,
} from "lucide-react";
import { apiFetch } from "@/lib/ui/api";

// Navigasi sesuai DOC.MD §12 — semua menu terhubung ke halaman yang benar-benar ada.
const NAV: { group: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    group: "Workspace",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    group: "Research",
    items: [
      { href: "/keywords", label: "Keyword Workspace", icon: KeyRound },
      { href: "/clusters", label: "AI Clustering", icon: Layers },
    ],
  },
  {
    group: "Content",
    items: [
      { href: "/analyzer", label: "SEO Content Analyzer", icon: ScanSearch },
      { href: "/content", label: "AI Content Studio", icon: PenSquare },
      { href: "/meta", label: "Bulk Meta Generator", icon: Tags },
    ],
  },
  {
    group: "Technical",
    items: [
      { href: "/crawl", label: "Technical Crawler", icon: Bot },
      { href: "/gsc", label: "Search Console", icon: SearchCode },
      { href: "/internal-links", label: "Internal Link & Topical", icon: Link2 },
      { href: "/geo", label: "GEO / AI Search", icon: Sparkles },
    ],
  },
  {
    group: "Reports",
    items: [
      { href: "/reports", label: "Report Generator", icon: FileBarChart },
      { href: "/history", label: "Riwayat", icon: History },
      { href: "/usage", label: "Usage Monitor", icon: Activity },
    ],
  },
  {
    group: "Pengaturan",
    items: [
      { href: "/projects", label: "Projects", icon: FolderGit2 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "DELETE" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <aside className="sticky top-0 flex h-svh w-60 shrink-0 flex-col border-r bg-background">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">SEO Toolkit AI</p>
          <p className="truncate text-[11px] text-muted-foreground">Gemini free tier · data nyata</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((section) => (
          <div key={section.group} className="mb-4">
            <p className="mb-1 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
              {section.group}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-primary font-medium text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-2">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" /> Keluar
        </button>
      </div>
    </aside>
  );
}
