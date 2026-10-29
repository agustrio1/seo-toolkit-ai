"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, apiFetchPaged, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, PageHeader, Select, SpinnerBlock, Table } from "@/components/ui";

interface HistoryRow {
  id: string;
  type: string;
  status: string;
  summary: string | null;
  model: string | null;
  createdAt: string;
  errorCode: string | null;
}
interface Detail extends HistoryRow {
  inputRef: Record<string, unknown>;
  result: Record<string, unknown> | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

const TYPES = [
  "", "content_analysis", "keyword_clustering", "content_brief", "article_draft",
  "meta_generation", "geo_analysis", "internal_link_analysis", "technical_audit", "gsc_analysis",
];

export default function HistoryPage() {
  const { projectId } = useActiveProject();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: "25" });
      if (projectId) params.set("projectId", projectId);
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      const r = await apiFetchPaged<HistoryRow[]>(`/api/history?${params}`);
      setRows(r.data);
      setTotal(r.pagination.total);
    } catch (e) {
      setError(errMessage(e));
      setRows([]);
    }
  }, [projectId, type, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setError(null);
    try {
      setDetail((await apiFetch<{ analysis: Detail }>(`/api/history/${id}`)).analysis);
    } catch (e) {
      setError(errMessage(e));
    }
  }

  return (
    <>
      <PageHeader title="Riwayat Analisis" subtitle="Semua hasil analisis tersimpan dan dapat dibuka kembali." />
      <div className="mb-5 max-w-md"><ProjectPicker /></div>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="max-w-52">
          {TYPES.map((t) => <option key={t} value={t}>{t ? t.replace(/_/g, " ") : "Semua tipe"}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="max-w-40">
          {["", "completed", "failed", "running", "queued"].map((s) => <option key={s} value={s}>{s || "Semua status"}</option>)}
        </Select>
      </div>

      {rows == null ? (
        <SpinnerBlock />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Tidak ada riwayat untuk filter ini.</p>
      ) : (
        <Table head={["Tipe", "Ringkasan", "Status", "Model", "Waktu", ""]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium text-slate-700">{r.type.replace(/_/g, " ")}</td>
              <td className="max-w-sm truncate px-3 py-2 text-slate-600">{r.summary ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "amber"}>
                  {r.status}{r.errorCode ? ` · ${r.errorCode}` : ""}
                </Badge>
              </td>
              <td className="px-3 py-2 text-slate-500">{r.model ?? "—"}</td>
              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString("id-ID")}</td>
              <td className="px-3 py-2 text-right"><button onClick={() => open(r.id)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">lihat hasil</button></td>
            </tr>
          ))}
        </Table>
      )}
      <div className="mt-3 flex items-center gap-3 text-sm text-slate-500">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">← Prev</button>
        <span>Hal {page} · total {total}</span>
        <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next →</button>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <Card className="max-h-[85vh] w-full max-w-3xl overflow-y-auto" >
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">{detail.type.replace(/_/g, " ")} · {new Date(detail.createdAt).toLocaleString("id-ID")}</h2>
                <Button variant="ghost" onClick={() => setDetail(null)} className="px-2 py-1 text-xs">Tutup ✕</Button>
              </div>
              {detail.summary && <p className="mb-3 text-sm text-slate-600">{detail.summary}</p>}
              <p className="text-xs text-slate-400">tokens: in={detail.tokensIn ?? "—"} out={detail.tokensOut ?? "—"} · model={detail.model ?? "—"}</p>
              <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                {JSON.stringify(detail.result ?? detail.inputRef, null, 2)}
              </pre>
              <p className="mt-2 text-xs text-slate-400">Hasil mentah tersimpan persis seperti saat analisis selesai — tidak diubah sejak itu.</p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
