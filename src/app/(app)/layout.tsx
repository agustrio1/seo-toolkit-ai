import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import AppShell from "@/components/app-shell";

export const dynamic = "force-dynamic";

/** Semua halaman panel dilindungi sesi di server; tanpa sesi → ke login. */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!(await getSessionUser())) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
