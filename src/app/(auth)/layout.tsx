import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">SEO Toolkit AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform SEO dengan Gemini (tier gratis) — tanpa data palsu.
          </p>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Dengan mendaftar Anda menyetujui{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">Ketentuan Layanan</Link>
          {" "}dan{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">Kebijakan Privasi</Link>.
        </p>
      </div>
    </div>
  );
}
