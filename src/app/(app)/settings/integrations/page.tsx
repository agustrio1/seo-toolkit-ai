"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, ApiError, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, PageHeader, SpinnerBlock } from "@/components/ui";

function IntegrationsInner() {
  const searchParams = useSearchParams();
  const gscParam = searchParams.get("gsc");
  const { projectId } = useActiveProject();

  const [status, setStatus] = useState<"unknown" | "connected" | "not_connected" | "not_configured" | "api_error">("unknown");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    try {
      await apiFetch("/api/gsc/properties");
      setStatus("connected");
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "GSC_NOT_CONFIGURED") setStatus("not_configured");
      else if (e instanceof ApiError && e.code === "NOT_CONNECTED") {
        setStatus("not_connected");
        setError(null);
      } else if (e instanceof ApiError && e.code !== "INVALID_STATE" && e.status === 502) {
        // Token tersimpan, tapi API Google menolak — tampilkan alasan asli, bukan "belum terhubung".
        setStatus("api_error");
        setError(errMessage(e));
      } else {
        setStatus("not_connected");
        setError(errMessage(e));
      }
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (gscParam === "connected") setNotice("Akun Google berhasil terhubung. Pilih properti di halaman Search Console.");
    else if (gscParam === "cancelled") setNotice("Koneksi dibatalkan — tidak ada token yang disimpan.");
    else if (gscParam === "error") setNotice(`Koneksi gagal (kode: ${searchParams.get("code") ?? "tidak diketahui"}). Periksa konfigurasi OAuth di server.`);
  }, [gscParam, searchParams]);

  async function disconnect() {
    if (!confirm("Putuskan koneksi Google? Token dicabut di Google dan dihapus dari database.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ warning?: string }>("/api/gsc/select", { method: "DELETE" });
      setNotice(r.warning ?? "Koneksi diputus.");
      setStatus("not_connected");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Integrasi" subtitle="Koneksi OAuth Google Search Console — terpisah dari login aplikasi." />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="properti dipilih untuk project aktif" /></div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <div className="mb-4"><Alert kind="info">{notice}</Alert></div>}

      <Card className="max-w-2xl">
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Google Search Console</h2>
            <Badge tone={status === "connected" ? "green" : status === "not_configured" ? "red" : status === "api_error" ? "amber" : status === "not_connected" ? "amber" : "slate"}>
              {status === "connected" ? "Terhubung" : status === "not_configured" ? "Belum dikonfigurasi di server" : status === "api_error" ? "Terhubung — API menolak" : status === "not_connected" ? "Belum terhubung" : "Memeriksa…"}
            </Badge>
          </div>

          {status === "not_configured" && (
            <Alert kind="error">
              Server belum memiliki GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI, atau Search Console API
              belum diaktifkan di Google Cloud. Aplikasi tetap berjalan tanpa GSC — modul lain tidak terpengaruh.
            </Alert>
          )}

          {status === "connected" || status === "api_error" ? (
            <div className="flex gap-2">
              {status === "connected" && <Link href="/gsc"><Button variant="secondary">Buka analisis Search Console</Button></Link>}
              <Button variant="danger" onClick={disconnect} loading={busy}>Putuskan koneksi</Button>
            </div>
          ) : status !== "not_configured" && status !== "unknown" ? (
            <p className="text-sm text-slate-600">
              Klik hubungkan — Anda akan diarahkan ke halaman resmi Google (OAuth 2.0 + PKCE). Kami hanya menyimpan token
              terenkripsi (AES-256-GCM) di server, scope read-only.
            </p>
          ) : null}

          {status !== "unknown" && status !== "connected" && status !== "api_error" && status !== "not_configured" && (
            <a
              href={projectId ? `/api/gsc/connect?projectId=${projectId}` : "/api/gsc/connect"}
              className="inline-block"
            >
              <Button loading={busy}>Hubungkan akun Google</Button>
            </a>
          )}
          {status === "not_connected" && !projectId && (
            <p className="text-xs text-amber-700">Pilih project terlebih dahulu agar properti dapat dipetakan.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<SpinnerBlock label="Memuat integrasi…" />}>
      <IntegrationsInner />
    </Suspense>
  );
}
