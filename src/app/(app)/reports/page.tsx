"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, downloadFile, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Label, PageHeader, Select, SpinnerBlock, Table } from "@/components/ui";

interface ReportRow {
  id: string;
  type: string;
  createdAt: string;
  itemCount: number | null;
  generatedAt: string | null;
}
interface SnapshotItem {
  id: string;
  createdAt: string;
  model: string | null;
  summary: string | null;
  result: unknown;
}

const TYPES = [
  "content_analysis", "keyword_clustering", "content_brief", "article_draft",
  "meta_generation", "geo_analysis", "internal_link_analysis", "gsc_analysis",
];

export default function ReportsPage() {
  const { projectId } = useActiveProject();
  const [type, setType] = useState(TYPES[0]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<{ id: string; type: string; items: SnapshotItem[]; generatedAt: string; projectName: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setRows([]);
      return;
    }
    try {
      const r = await apiFetch<{ reports: ReportRow[] }>(`/api/reports?projectId=${projectId}`);
      setRows(r.reports);
    } catch (e) {
      setError(errMessage(e));
      setRows([]);
    }
  }, [projectId]);

  useEffect(() => {
    setView(null);
    void load();
  }, [load]);

  async function generate() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch<{ reportId: string; itemCount: number }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          type,
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
        }),
      });
      setNotice(`Laporan dibuat dari ${r.itemCount} hasil analisis nyata.`);
      await load();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setError(null);
    try {
      const r = await apiFetch<{ report: { id: string; type: string; snapshot: { items: SnapshotItem[]; generatedAt: string; projectName: string | null } } }>(`/api/reports/${id}`);
      setView({ id: r.report.id, type: r.report.type, items: r.report.snapshot.items, generatedAt: r.report.snapshot.generatedAt, projectName: r.report.snapshot.projectName });
    } catch (e) {
      setError(errMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Report Generator"
        subtitle="Snapshot hasil analisis tersimpan — isinya data nyata, dapat dibuka, dicopy, atau diunduh CSV."
      />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="laporan dibuat per project" /></div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <div className="mb-4"><Alert kind="success">{notice}</Alert></div>}

      <Card className="mb-6">
        <CardBody className="grid items-end gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="rt">Tipe laporan</Label>
            <Select id="rt" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="rf">Dari (opsional)</Label>
            <Input id="rf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rto">Sampai (opsional)</Label>
            <Input id="rto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={generate} loading={busy} disabled={!projectId}>Buat snapshot laporan</Button>
        </CardBody>
      </Card>

      {rows == null ? (
        <SpinnerBlock />
      ) : rows.length === 0 ? (
        <EmptyState title="Belum ada laporan" description="Jalankan analisis di modul terkait, lalu buat snapshot di sini." />
      ) : (
        <Table head={["Tipe", "Item", "Dibuat", ""]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium text-slate-700">{r.type.replace(/_/g, " ")}</td>
              <td className="px-3 py-2">{r.itemCount ?? "—"} <Badge tone="slate">analisis</Badge></td>
              <td className="px-3 py-2 text-slate-500">{new Date(r.createdAt).toLocaleString("id-ID")}</td>
              <td className="space-x-3 px-3 py-2 text-right">
                <button onClick={() => open(r.id)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">lihat</button>
                <button onClick={() => downloadFile(`/api/reports/${r.id}/export`, `laporan-${r.type}.csv`)} className="text-xs text-slate-600 hover:underline">unduh CSV</button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setView(null)}>
          <Card className="max-h-[85vh] w-full max-w-4xl overflow-y-auto">
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">
                  Laporan {view.type.replace(/_/g, " ")} — {view.projectName ?? ""}
                  <span className="ml-2 text-xs font-normal text-slate-400">dibuat {new Date(view.generatedAt).toLocaleString("id-ID")}</span>
                </h2>
                <Button variant="ghost" onClick={() => setView(null)} className="px-2 py-1 text-xs">Tutup ✕</Button>
              </div>
              <div className="space-y-3">
                {view.items.map((it) => (
                  <div key={it.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-700">{it.summary ?? "(tanpa ringkasan)"}</p>
                      <span className="text-xs text-slate-400">{new Date(it.createdAt).toLocaleString("id-ID")} · {it.model ?? "—"}</span>
                    </div>
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                      {JSON.stringify(it.result, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">Gunakan &quot;unduh CSV&quot; untuk mengimpor ke spreadsheet; kolom result memuat JSON lengkap tiap analisis.</p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
