"use client";

import { useEffect, useState } from "react";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Card, CardBody, PageHeader, Select, SpinnerBlock, Table } from "@/components/ui";

interface Usage {
  periodDays: number;
  byTool: { tool: string; requests: number; tokensIn: number; tokensOut: number }[];
  byStatus: { status: string; n: number }[];
  daily: { day: string; n: number }[];
  recent: { id: string; tool: string; status: string; model: string | null; tokensIn: number | null; tokensOut: number | null; createdAt: string }[];
  globalDaily: { used: number; cap: number; note: string };
}

export default function UsagePage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    apiFetch<Usage>(`/api/usage?days=${days}`).then(setData).catch((e) => setError(errMessage(e)));
  }, [days]);

  const maxDay = data ? Math.max(...data.daily.map((d) => d.n), 1) : 1;

  return (
    <>
      <PageHeader
        title="AI Usage Monitor"
        subtitle="Pemakaian Gemini tier gratis yang dicatat nyata dari database. Bukan angka hiasan."
        actions={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-36">
            {[1, 7, 14, 30, 90].map((d) => <option key={d} value={d}>terakhir {d} hari</option>)}
          </Select>
        }
      />
      {error && <Alert kind="error">{error}</Alert>}
      {!data ? <SpinnerBlock /> : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <Card>
              <CardBody>
                <p className="text-sm text-slate-500">Budget global harian (semua user)</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{data.globalDaily.used} / {data.globalDaily.cap}</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${data.globalDaily.used >= data.globalDaily.cap ? "bg-red-500" : data.globalDaily.used > data.globalDaily.cap * 0.8 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, (data.globalDaily.used / data.globalDaily.cap) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">{data.globalDaily.note}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="mb-2 text-sm text-slate-500">Status request (periode)</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.byStatus.length === 0 && <span className="text-sm text-slate-400">belum ada</span>}
                  {data.byStatus.map((s) => (
                    <Badge key={s.status} tone={s.status === "ok" ? "green" : s.status === "rate_limited" ? "amber" : s.status === "error" ? "red" : "slate"}>
                      {s.status}: {s.n}
                    </Badge>
                  ))}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="mb-2 text-sm text-slate-500">Request per hari</p>
                <div className="flex h-16 items-end gap-0.5">
                  {data.daily.map((d) => (
                    <div key={d.day} className="w-2.5 rounded-t bg-primary/60" style={{ height: `${(d.n / maxDay) * 100}%` }} title={`${d.day}: ${d.n}`} />
                  ))}
                  {data.daily.length === 0 && <span className="text-sm text-slate-400">belum ada</span>}
                </div>
              </CardBody>
            </Card>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-800">Per modul</h2>
          <Table head={["Tool", "Request", "Token masuk", "Token keluar"]}>
            {data.byTool.map((t) => (
              <tr key={t.tool}>
                <td className="px-3 py-2 text-slate-700">{t.tool}</td>
                <td className="px-3 py-2">{t.requests}</td>
                <td className="px-3 py-2">{t.tokensIn.toLocaleString("id-ID")}</td>
                <td className="px-3 py-2">{t.tokensOut.toLocaleString("id-ID")}</td>
              </tr>
            ))}
            {data.byTool.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Belum ada pemakaian pada periode ini.</td></tr>
            )}
          </Table>

          <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-800">Log terbaru (maks 50)</h2>
          <Table head={["Waktu", "Tool", "Status", "Model", "Token (in/out)"]}>
            {data.recent.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString("id-ID")}</td>
                <td className="px-3 py-2 text-slate-700">{r.tool}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.status === "ok" ? "green" : r.status === "rate_limited" ? "amber" : r.status === "error" ? "red" : "slate"}>{r.status}</Badge>
                </td>
                <td className="px-3 py-2 text-slate-500">{r.model ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{r.tokensIn ?? "—"} / {r.tokensOut ?? "—"}</td>
              </tr>
            ))}
            {data.recent.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">Kosong.</td></tr>
            )}
          </Table>
          <p className="mt-3 text-xs text-slate-400">
            Estimasi biaya tidak ditampilkan: API tier gratis tidak mengembalikan informasi harga dan tarif dapat berubah kapan saja.
          </p>
        </>
      )}
    </>
  );
}
