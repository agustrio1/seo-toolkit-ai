"use client";

import { useEffect, useState } from "react";
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
  Menu,
  X,
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

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight">SEO Toolkit AI</p>
        <p className="truncate text-[11px] text-muted-foreground">Gemini free tier · data nyata</p>
      </div>
    </div>
  );
}

function NavContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
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
                  onClick={onNavigate}
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
  );
}

/** Kerangka panel aplikasi: sidebar statis di desktop, drawer + top bar di mobile. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Tutup drawer setiap kali rute berubah.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Kunci scroll body saat drawer terbuka.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "DELETE" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-svh bg-muted/30">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-background lg:flex">
        <div className="border-b px-4 py-4">
          <Brand />
        </div>
        <NavContent pathname={pathname} />
        <div className="border-t p-2">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* Kolom konten */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar mobile */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <Brand />
          <button
            onClick={() => setOpen(true)}
            aria-label="Buka menu navigasi"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        {/* Overlay + drawer mobile */}
        <div
          className={`fixed inset-0 z-50 bg-black/50 transition-opacity lg:hidden ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-background transition-transform duration-200 ease-out lg:hidden ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Navigasi utama"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <Brand />
            <button
              onClick={() => setOpen(false)}
              aria-label="Tutup menu navigasi"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <NavContent pathname={pathname} onNavigate={() => setOpen(false)} />
          <div className="border-t p-2">
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="h-4 w-4" /> Keluar
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
