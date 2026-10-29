import Link from "next/link";
import { Sparkles } from "lucide-react";

/** Halaman publik (tanpa login) — diperlukan untuk verifikasi OAuth Google. */
export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/login" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">SEO Toolkit AI</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="transition-colors hover:text-foreground">Privasi</Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">Ketentuan</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="space-y-6 leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-medium [&_li]:ml-1 [&_p]:text-sm [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_code]:[overflow-wrap:anywhere]">
          {children}
        </div>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} SEO Toolkit AI · jadikanweb.id</p>
          <p>
            Kontak:{" "}
            <a href="mailto:contact@jadikanweb.id" className="underline underline-offset-4 hover:text-foreground">
              contact@jadikanweb.id
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
