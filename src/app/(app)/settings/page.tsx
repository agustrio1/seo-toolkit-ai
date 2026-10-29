"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Button, Card, CardBody, Input, Label, PageHeader, Select, SpinnerBlock } from "@/components/ui";

interface SettingsData {
  email: string;
  name: string | null;
  defaultProjectId: string | null;
  preferences: {
    model?: string;
    language?: string;
    outputLength?: string;
    crawlMaxUrls?: number;
    historyRetentionDays?: number;
    reportPreference?: string;
  } | null;
  allowedModels: readonly string[];
  geminiConfigured: boolean;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [model, setModel] = useState("");
  const [outputLength, setOutputLength] = useState("medium");
  const [reportPreference, setReportPreference] = useState("csv");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retentionDays, setRetentionDays] = useState(180);

  useEffect(() => {
    apiFetch<SettingsData>("/api/settings")
      .then((d) => {
        setData(d);
        setModel(d.preferences?.model ?? d.allowedModels[0]);
        setOutputLength(d.preferences?.outputLength ?? "medium");
        setReportPreference(d.preferences?.reportPreference ?? "csv");
      })
      .catch((e) => setError(errMessage(e)));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ preferences: { model, outputLength, reportPreference } }),
      });
      setNotice("Preferensi disimpan.");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function purgeHistory() {
    if (!confirm(`Hapus riwayat analisis lebih tua dari ${retentionDays} hari? Tindakan ini permanen.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch<{ deletedCount: number }>(`/api/settings?olderThanDays=${retentionDays}`, { method: "DELETE" });
      setNotice(`${r.deletedCount} entri riwayat dihapus.`);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) return <SpinnerBlock label="Memuat pengaturan…" />;

  return (
    <>
      <PageHeader title="Settings" subtitle="Preferensi akun & retensi data. Secret/API key tidak pernah ditampilkan di sini." />
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <div className="mb-4"><Alert kind="success">{notice}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Akun</h2>
            <div><Label>Email</Label><Input value={data?.email ?? ""} disabled /></div>
            <div><Label>Nama</Label><Input value={data?.name ?? ""} disabled /></div>
            <p className="text-xs text-slate-500">
              Status AI: {data?.geminiConfigured ? "GEMINI_API_KEY terpasang di server." : "GEMINI_API_KEY belum dipasang — fitur AI nonaktif."}
            </p>
            <div className="border-t border-slate-200 pt-3">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Integrasi</h2>
              <Link href="/settings/integrations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Koneksi Google Search Console →
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Preferensi AI</h2>
            <div>
              <Label htmlFor="model">Model (allowlist tier gratis)</Label>
              <Select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
                {(data?.allowedModels ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <p className="mt-1 text-xs text-slate-500">Hanya model dalam allowlist server yang dapat dipakai; selain itu ditolak.</p>
            </div>
            <div>
              <Label htmlFor="olen">Panjang keluaran artikel</Label>
              <Select id="olen" value={outputLength} onChange={(e) => setOutputLength(e.target.value)}>
                <option value="short">pendek</option><option value="medium">sedang</option><option value="long">panjang</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rep">Format laporan favorit</Label>
              <Select id="rep" value={reportPreference} onChange={(e) => setReportPreference(e.target.value)}>
                <option value="csv">CSV</option><option value="html">HTML (tampilan cetak)</option>
              </Select>
            </div>
            <Button onClick={save} loading={busy}>Simpan preferensi</Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Retensi riwayat</h2>
            <div className="flex items-end gap-3">
              <div>
                <Label htmlFor="ret">Hapus riwayat lebih tua dari (hari)</Label>
                <Input id="ret" type="number" min={30} max={730} value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value))} className="w-40" />
              </div>
              <Button variant="danger" onClick={purgeHistory} loading={busy}>Hapus</Button>
            </div>
            <p className="text-xs text-slate-500">Hanya menghapus riwayat analisis milik akun Anda. Project & keyword tidak terpengaruh.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
