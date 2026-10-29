"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { apiFetch, apiFetchPaged } from "@/lib/ui/api";
import { useActiveProject } from "@/lib/ui/use-projects";
import { Card, CardBody, PageHeader, StatCard, Badge, SpinnerBlock, Alert } from "@/components/ui";

interface SettingsData {
  name: string | null;
  email: string;
  geminiConfigured: boolean;
}
interface UsageData {
  byTool: { tool: string; requests: number }[];
  globalDaily: { used: number; cap: number; note: string };
}
interface HistoryRow {
  id: string;
  type: string;
  status: string;
  summary: string | null;
  createdAt: string;
}

export default function DashboardPage() {
  const { projectId, projects, loading: projLoading } = useActiveProject();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [kwTotal, setKwTotal] = useState<number | null>(null);
  const [recent, setRecent] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SettingsData>("/api/settings").then(setSettings).catch((e) => setError(String(e?.message ?? e)));
    apiFetch<UsageData>("/api/usage?days=7").then(setUsage).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setKwTotal(null);
      setRecent([]);
      return;
    }
    apiFetchPaged<unknown[]>(`/api/keywords?projectId=${projectId}&perPage=1`)
      .then((r) => setKwTotal(r.pagination.total))
      .catch(() => setKwTotal(null));
    apiFetchPaged<HistoryRow[]>(`/api/history?projectId=${projectId}&perPage=5`)
      .then((r) => setRecent(r.data))
      .catch(() => setRecent([]));
  }, [projectId]);

  const totalRequests7d = usage ? usage.byTool.reduce((a, b) => a + b.requests, 0) : null;

  return (
    <>
      <PageHeader
        title={`Halo${settings?.name ? `, ${settings.name}` : ""} 👋`}
        subtitle="Ringkasan nyata dari data Anda — tanpa angka estimasi palsu."
      />
      {error && <Alert kind="error">{error}</Alert>}

      {/* Status koneksi layanan (jujur) */}
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {settings && (
          settings.geminiConfigured ? (
            <Badge tone="green">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Gemini siap (server-side, tier gratis)
            </Badge>
          ) : (
            <Badge tone="red">
              <XCircle className="mr-1 h-3.5 w-3.5" /> GEMINI_API_KEY belum diatur — fitur AI nonaktif
            </Badge>
          )
        )}
        {usage && (
          <Badge tone={usage.globalDaily.used >= usage.globalDaily.cap ? "red" : "indigo"}>
            Pemakaian AI global hari ini: {usage.globalDaily.used}/{usage.globalDaily.cap}
          </Badge>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Project aktif" value={projLoading ? "…" : projects.length} hint="Dibuat di menu Projects" />
        <StatCard
          label="Keyword di project aktif"
          value={projectId == null ? "—" : kwTotal == null ? "…" : kwTotal}
          hint={projectId == null ? "Pilih project di halaman Keywords" : "Hanya data yang Anda impor/input"}
        />
        <StatCard label="Request AI 7 hari (Anda)" value={totalRequests7d == null ? "…" : totalRequests7d} hint="Tercatat di Usage Monitor" />
        <StatCard label="Riwayat analisis terbaru" value={recent.length} hint="Dari modul analisis" />
      </div>

      {projects.length === 0 && !projLoading && (
        <Card className="mb-6 border-border bg-primary text-primary-foreground shadow-md">
          <CardBody>
            <p className="text-sm font-semibold">Mulai dengan membuat project</p>
            <p className="mt-1 text-sm text-primary-foreground/80">
              Semua modul (keyword, crawler, konten, laporan) bekerja per project. Data volume/difficulty/CPC hanya terisi
              bila Anda kirim sendiri — aplikasi tidak pernah mengarang angka.
            </p>
            <Link href="/projects" className="mt-3 inline-flex h-9 items-center gap-1 rounded-md bg-primary-foreground px-4 text-sm font-medium text-primary shadow-xs transition-colors hover:bg-primary-foreground/90">
              Buat project <ArrowRight className="h-4 w-4" />
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Aktivitas terakhir (project aktif)</h2>
            {!projectId ? (
              <p className="text-sm text-slate-500">Belum ada project aktif dipilih.</p>
            ) : recent.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada analisis. Jalankan salah satu modul di menu kiri.</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-0">
                    <div>
                      <p className="font-medium text-slate-700">{r.type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-slate-500">{r.summary || "(tanpa ringkasan)"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>
                      <p className="mt-1 text-xs text-slate-400">{new Date(r.createdAt).toLocaleString("id-ID")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Modul tersedia</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                ["/analyzer", "SEO Content Analyzer"],
                ["/keywords", "Keyword Workspace"],
                ["/clusters", "AI Clustering"],
                ["/content", "AI Content Studio"],
                ["/meta", "Bulk Meta Generator"],
                ["/crawl", "Technical Crawler"],
                ["/gsc", "Search Console"],
                ["/internal-links", "Internal Link & Topical"],
                ["/geo", "GEO / AI Search"],
                ["/reports", "Report Generator"],
                ["/usage", "Usage Monitor"],
                ["/settings", "Settings"],
              ].map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-md border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {label}
                </Link>
              ))}
            </div>
            {usage && <p className="mt-4 text-xs text-slate-400">{usage.globalDaily.note}</p>}
          </CardBody>
        </Card>
      </div>
      {!settings && <SpinnerBlock label="Memuat status…" />}
    </>
  );
}
