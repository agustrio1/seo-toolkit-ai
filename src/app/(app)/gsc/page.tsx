"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, ApiError, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, Input, Label, PageHeader, Select, Table } from "@/components/ui";

interface GscRow {
  dimensionValue: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}
interface GscResult {
  property: string;
  range: { startDate: string; endDate: string };
  totals: { clicks: number; impressions: number; ctr: number; avgPosition: number };
  rows: GscRow[];
  notes: string[];
}

interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

interface QuickWin {
  query: string;
  page: string | null;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  potentialClicks: number | null;
}
interface Mover {
  query: string;
  cur: { clicks: number; impressions: number; position: number };
  prev: { clicks: number; impressions: number; position: number };
  dPosition: number;
  dClicks: number;
}
interface InsightsResult {
  property: string;
  range: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } };
  totals: {
    current: { clicks: number; impressions: number; ctr: number; avgPosition: number };
    previous: { clicks: number; impressions: number; ctr: number; avgPosition: number };
    delta: { clicks: number; impressions: number; position: number };
  };
  benchmarkCtr: number | null;
  quickWins: QuickWin[];
  movers: { risers: Mover[]; decliners: Mover[] };
  notes: string[];
}

function signed(n: number, digits = 0) {
  const v = digits ? n.toFixed(digits) : String(Math.round(n));
  return n > 0 ? `+${v}` : v;
}

function isoDaysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export default function GscPage() {
  const { projectId } = useActiveProject();
  const [status, setStatus] = useState<string | null>(null);
  const [sites, setSites] = useState<GscSite[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(isoDaysAgo(28));
  const [endDate, setEndDate] = useState(isoDaysAgo(1));
  const [dimension, setDimension] = useState<"query" | "page">("query");
  const [device, setDevice] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GscResult | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [insightsBusy, setInsightsBusy] = useState(false);

  const loadProps = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      const r = await apiFetch<{ sites: GscSite[]; current: string | null }>("/api/gsc/properties");
      setSites(r.sites);
      setCurrent(r.current);
      setStatus("connected");
    } catch (e) {
      if (e instanceof ApiError && (e.code === "NOT_CONNECTED" || e.code === "GSC_NOT_CONFIGURED" || e.status === 401)) {
        setStatus(e.code);
        setError(e.message);
      } else if (e instanceof ApiError && e.code === "GSC_FORBIDDEN") {
        // Token ada, tapi API menolak — tampilkan diagnosis, tetap di mode "connected".
        setStatus("error");
        setError(e.message);
      } else {
        setStatus("error");
        setError(errMessage(e));
      }
    }
  }, [projectId]);

  useEffect(() => {
    void loadProps();
  }, [loadProps]);

  async function select(siteUrl: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/gsc/select", { method: "POST", body: JSON.stringify({ projectId, siteUrl }) });
      setNotice(`Properti dipilih: ${siteUrl}`);
      await loadProps();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function fetchPerformance() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiFetch<GscResult>("/api/gsc/performance", {
        method: "POST",
        body: JSON.stringify({
          projectId, startDate, endDate, dimension,
          ...(device ? { device } : {}),
        }),
      });
      setResult(r);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function fetchInsights() {
    if (!projectId) return;
    setInsightsBusy(true);
    setError(null);
    setInsights(null);
    try {
      setInsights(await apiFetch<InsightsResult>("/api/gsc/insights", {
        method: "POST",
        body: JSON.stringify({ projectId, startDate, endDate, ...(device ? { device } : {}) }),
      }));
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setInsightsBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Google Search Console"
        subtitle="Data asli dari API resmi Search Console (bukan estimasi). OAuth dikoneksikan per akun Google."
        actions={<Link href="/settings/integrations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Pengaturan integrasi →</Link>}
      />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="properti GSC dipetakan per project" /></div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {status === "connected" && <Badge tone="green">Terhubung{current ? ` · ${current}` : ""}</Badge>}
        {status === "GSC_NOT_CONFIGURED" && <Badge tone="red">OAuth Google belum dikonfigurasi di server</Badge>}
        {status === "NOT_CONNECTED" && <Badge tone="amber">Belum ada token terhubung</Badge>}
        {["GSC_NOT_CONFIGURED", "NOT_CONNECTED", "error"].includes(status ?? "") && (
          <Link href="/settings/integrations">
            <Button variant="secondary">Hubungkan akun Google</Button>
          </Link>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <div className="my-4"><Alert kind="success">{notice}</Alert></div>}

      {status === "connected" && sites && (
        <Card className="mb-6">
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Properti yang tersedia di akun Anda</h2>
            {sites.length === 0 ? (
              <p className="text-sm text-slate-500">Akun Google Anda belum punya properti terverifikasi di Search Console.</p>
            ) : (
              <ul className="space-y-1.5">
                {sites.map((s) => (
                  <li key={s.siteUrl} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2 truncate text-foreground">
                      {s.siteUrl}
                      <Badge tone="slate">{s.permissionLevel}</Badge>
                      {s.siteUrl === current && <Badge tone="green">aktif</Badge>}
                    </span>
                    <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={busy || s.siteUrl === current} onClick={() => select(s.siteUrl)}>
                      {s.siteUrl === current ? "Terpilih" : "Pilih untuk project ini"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {current && (
        <Card className="mb-6">
          <CardBody className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">Analisis performa</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <div><Label htmlFor="sd">Mulai</Label><Input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label htmlFor="ed">Sampai</Label><Input id="ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              <div>
                <Label htmlFor="dim">Dimensi</Label>
                <Select id="dim" value={dimension} onChange={(e) => setDimension(e.target.value as "query" | "page")}>
                  <option value="query">Query</option><option value="page">Halaman</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="dev">Device (opsional)</Label>
                <Select id="dev" value={device} onChange={(e) => setDevice(e.target.value)}>
                  <option value="">semua</option><option value="DESKTOP">Desktop</option><option value="MOBILE">Mobile</option><option value="TABLET">Tablet</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={fetchPerformance} loading={busy} disabled={!projectId}>Ambil data (API resmi GSC, tanpa biaya AI)</Button>
              <Button variant="secondary" onClick={fetchInsights} loading={insightsBusy} disabled={!projectId}>
                Peluang &amp; bandingkan periode sebelumnya
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {result && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Total klik", result.totals.clicks],
              ["Total impresi", result.totals.impressions],
              ["CTR gabungan", `${(result.totals.ctr * 100).toFixed(2)}%`],
              ["Posisi rata-rata (tertimbang)", result.totals.avgPosition.toFixed(2)],
            ].map(([l, v], i) => (
              <Card key={i}><CardBody className="py-3"><p className="text-xs text-slate-500">{String(l)}</p><p className="mt-0.5 text-xl font-semibold text-slate-800">{String(v)}</p></CardBody></Card>
            ))}
          </div>
          <Table head={[dimension === "query" ? "Query" : "Halaman", "Klik", "Impresi", "CTR", "Posisi"]}>
            {result.rows.map((r) => (
              <tr key={r.dimensionValue}>
                <td className="max-w-md truncate px-3 py-2 text-slate-700">{r.dimensionValue}</td>
                <td className="px-3 py-2">{r.clicks}</td>
                <td className="px-3 py-2">{r.impressions}</td>
                <td className="px-3 py-2">{(r.ctr * 100).toFixed(2)}%</td>
                <td className="px-3 py-2">{r.position.toFixed(1)}</td>
              </tr>
            ))}
          </Table>
          <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}

      {insights && (
        <div className="mt-8 space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Peluang &amp; perbandingan periode</h2>
            <p className="text-xs text-slate-500">
              Aktif: {insights.range.current.startDate} s/d {insights.range.current.endDate} · Pembanding: {insights.range.previous.startDate} s/d {insights.range.previous.endDate}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><CardBody className="py-3">
              <p className="text-xs text-slate-500">Klik ({signed(insights.totals.delta.clicks)})</p>
              <p className="mt-0.5 text-xl font-semibold text-slate-800">{insights.totals.current.clicks}</p>
              <p className={`text-xs ${insights.totals.delta.clicks >= 0 ? "text-emerald-600" : "text-red-600"}`}>dari {insights.totals.previous.clicks} periode sebelumnya</p>
            </CardBody></Card>
            <Card><CardBody className="py-3">
              <p className="text-xs text-slate-500">Impresi ({signed(insights.totals.delta.impressions)})</p>
              <p className="mt-0.5 text-xl font-semibold text-slate-800">{insights.totals.current.impressions}</p>
              <p className={`text-xs ${insights.totals.delta.impressions >= 0 ? "text-emerald-600" : "text-red-600"}`}>dari {insights.totals.previous.impressions}</p>
            </CardBody></Card>
            <Card><CardBody className="py-3">
              <p className="text-xs text-slate-500">Posisi rata-rata ({signed(insights.totals.delta.position, 2)})</p>
              <p className="mt-0.5 text-xl font-semibold text-slate-800">{insights.totals.current.avgPosition.toFixed(2)}</p>
              <p className={`text-xs ${insights.totals.delta.position <= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {insights.totals.delta.position <= 0 ? "membaik" : "melemah"} dari {insights.totals.previous.avgPosition.toFixed(2)}
              </p>
            </CardBody></Card>
            <Card><CardBody className="py-3">
              <p className="text-xs text-slate-500">CTR gabungan</p>
              <p className="mt-0.5 text-xl font-semibold text-slate-800">{(insights.totals.current.ctr * 100).toFixed(2)}%</p>
              <p className="text-xs text-slate-500">sebelumnya {(insights.totals.previous.ctr * 100).toFixed(2)}%</p>
            </CardBody></Card>
          </div>

          <Card>
            <CardBody>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">⚡ Peluang cepat — posisi 4–15, impresi terbanyak ({insights.quickWins.length})</h3>
                <Badge tone="green">data nyata GSC</Badge>
              </div>
              {insights.quickWins.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada query di posisi 4–15 dengan impresi ≥ 5 pada rentang ini — sinyal kuat belum terbentuk.</p>
              ) : (
                <>
                  <p className="mb-2 text-xs text-slate-400">Perbaiki/ perluas halaman target untuk naik ke posisi ≤3 — sering cukup dengan optimasi on-page, tanpa konten baru.</p>
                  <Table head={["Query", "Halaman target", "Posisi", "Impresi", "Klik", "CTR", "Proyeksi klik @pos ≤3"]}>
                    {insights.quickWins.map((w) => (
                      <tr key={w.query}>
                        <td className="max-w-56 truncate px-3 py-2 text-slate-700" title={w.query}>{w.query}</td>
                        <td className="max-w-56 truncate px-3 py-2 text-slate-500" title={w.page ?? undefined}>{w.page ?? "—"}</td>
                        <td className="px-3 py-2"><Badge tone={w.position <= 7 ? "amber" : "slate"}>{w.position.toFixed(1)}</Badge></td>
                        <td className="px-3 py-2">{w.impressions}</td>
                        <td className="px-3 py-2">{w.clicks}</td>
                        <td className="px-3 py-2">{(w.ctr * 100).toFixed(1)}%</td>
                        <td className="px-3 py-2 font-medium text-emerald-700">{w.potentialClicks ?? "—"}</td>
                      </tr>
                    ))}
                  </Table>
                </>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardBody>
                <h3 className="mb-2 text-sm font-semibold text-red-700">📉 Query melemah vs periode sebelumnya ({insights.movers.decliners.length})</h3>
                {insights.movers.decliners.length === 0 ? (
                  <p className="text-sm text-slate-500">Tidak ada query yang posisinya turun ≥1 (dengan data pembanding cukup).</p>
                ) : (
                  <Table head={["Query", "Posisi", "Δ", "Klik"]}>
                    {insights.movers.decliners.map((m) => (
                      <tr key={m.query}>
                        <td className="max-w-44 truncate px-3 py-2 text-slate-700" title={m.query}>{m.query}</td>
                        <td className="px-3 py-2 text-slate-500">{m.prev.position.toFixed(1)} → <span className="font-medium text-slate-800">{m.cur.position.toFixed(1)}</span></td>
                        <td className="px-3 py-2"><Badge tone="red">{m.dPosition.toFixed(1)}</Badge></td>
                        <td className="px-3 py-2 text-slate-500">{signed(m.dClicks)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <h3 className="mb-2 text-sm font-semibold text-emerald-700">📈 Query membaik ({insights.movers.risers.length})</h3>
                {insights.movers.risers.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada kenaikan posisi ≥1 pada query yang sama.</p>
                ) : (
                  <Table head={["Query", "Posisi", "Δ", "Klik"]}>
                    {insights.movers.risers.map((m) => (
                      <tr key={m.query}>
                        <td className="max-w-44 truncate px-3 py-2 text-slate-700" title={m.query}>{m.query}</td>
                        <td className="px-3 py-2 text-slate-500">{m.prev.position.toFixed(1)} → <span className="font-medium text-slate-800">{m.cur.position.toFixed(1)}</span></td>
                        <td className="px-3 py-2"><Badge tone="green">+{m.dPosition.toFixed(1)}</Badge></td>
                        <td className="px-3 py-2 text-slate-500">{signed(m.dClicks)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>

          <ul className="list-disc pl-5 text-xs text-slate-500">{insights.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </>
  );
}
