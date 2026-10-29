import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/sessions";
import Sidebar from "@/components/sidebar";

export const dynamic = "force-dynamic";

/** Semua halaman panel dilindungi sesi di server; tanpa sesi → ke login. */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!(await getSessionUser())) redirect("/login");
  return (
    <div className="flex min-h-svh bg-muted/30">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
