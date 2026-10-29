"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, downloadFile, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Label, PageHeader, Select, SpinnerBlock, Table } from "@/components/ui";

interface CrawlJob {
  id: string;
  startUrl: string;
  status: string;
  maxUrls: number;
  urlsDone: number;
  urlsFound: number;
  createdAt: string;
  errorSummary: string | null;
}
interface CrawlPage {
  id: string;
  url: string;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  h1s: string[] | null;
}
interface Findings {
  totalPages: number;
  httpErrors: { url: string; status: number }[];
  missingH1: string[];
  multipleH1: { url: string; count: number }[];
  duplicateTitles: { title: string; urls: string[] }[];
  duplicateDescriptions: { description: string; urls: string[] }[];
  missingMetaDescription: string[];
  longTitles: { url: string; length: number }[];
  longDescriptions: { url: string; length: number }[];
  canonicalMismatch: { url: string; canonical: string }[];
  noIndexPages: string[];
  imagesWithoutAltTotal: number;
  unreachableInternalLinks: string[];
}

export default function CrawlPageUI() {
  const { projectId } = useActiveProject();
  const [startUrl, setStartUrl] = useState("");
  const [maxUrls, setMaxUrls] = useState(30);
  const [jobs, setJobs] = useState<CrawlJob[] | null>(null);
  const [detail, setDetail] = useState<{ job: CrawlJob; pages: CrawlPage[]; findings: Findings } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!projectId) return;
    try {
      setJobs(await apiFetch<CrawlJob[]>(`/api/crawl?projectId=${projectId}`));
    } catch (e) {
      setError(errMessage(e));
    }
  }, [projectId]);

  useEffect(() => {
    setJobs(null);
    setDetail(null);
    void loadJobs();
  }, [loadJobs]);

  async function createJob() {
    if (!projectId || !startUrl) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch<{ jobId: string; disallowed: string[] }>("/api/crawl", {
        method: "POST",
        body: JSON.stringify({ projectId, startUrl, maxUrls }),
      });
      setNotice(
        r.disallowed.length > 0
          ? `Job dibuat. robots.txt melarang ${r.disallowed.length} path — crawler akan mematuhinya.`
          : "Job dibuat. Jalankan batch sampai selesai (maks 50 URL, depth ≤3).",
      );
      await loadJobs();
      await openJob(r.jobId);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openJob(id: string) {
    setError(null);
    try {
      setDetail(await apiFetch<{ job: CrawlJob; pages: CrawlPage[]; findings: Findings }>(`/api/crawl/${id}`));
    } catch (e) {
      setError(errMessage(e));
    }
  }

  async function runBatch() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ processed: number; remaining: number; finished: boolean }>(`/api/crawl/${detail.job.id}/run`, {
        method: "POST",
      });
      setNotice(
        r.finished
          ? `Crawl selesai. ${r.processed} URL diproses pada batch terakhir.`
          : `Batch memproses ${r.processed} URL; masih ${r.remaining} di antrean.`,
      );
      await openJob(detail.job.id);
      await loadJobs();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const f = detail?.findings;

  return (
    <>
      <PageHeader
        title="Technical SEO Crawler"
        subtitle="Crawl internal domain dengan proteksi SSRF, hormati robots.txt, maks 50 URL/job. Tidak memakai AI (hemat kuota)."
      />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="crawl membutuhkan project (domain menjadi batas crawl)" /></div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <div className="mb-4"><Alert kind="info">{notice}</Alert></div>}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody className="space-y-3">
            <div>
              <Label htmlFor="su">URL awal (mis. https://contoh.com/)</Label>
              <Input id="su" value={startUrl} onChange={(e) => setStartUrl(e.target.value)} placeholder="https://situsanda.com" />
            </div>
            <div className="max-w-40">
              <Label htmlFor="mu">Maks URL</Label>
              <Select id="mu" value={maxUrls} onChange={(e) => setMaxUrls(Number(e.target.value))}>
                {[10, 20, 30, 40, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
            <Button onClick={createJob} loading={busy} disabled={!projectId || !startUrl}>Buat crawl job</Button>
            <p className="text-xs text-slate-500">
              localhost, IP privat, dan endpoint metadata cloud ditolak pada level DNS (bukan hanya validasi string).
            </p>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardBody>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">Job pada project ini</h2>
            {jobs == null ? <SpinnerBlock label="Memuat job…" /> : jobs.length === 0 ? <p className="text-sm text-slate-500">Belum ada job.</p> : (
              <ul className="space-y-1.5">
                {jobs.slice(0, 10).map((j) => (
                  <li key={j.id}>
                    <button onClick={() => openJob(j.id)} className="flex w-full items-center justify-between gap-2 rounded border border-slate-200 px-2.5 py-1.5 text-left text-sm hover:bg-slate-50">
                      <span className="truncate text-slate-700">{j.startUrl}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                        {j.urlsDone}/{j.maxUrls}
                        <Badge tone={j.status === "completed" ? "green" : j.status === "failed" ? "red" : j.status === "cancelled" ? "slate" : "amber"}>{j.status}</Badge>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {detail && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{detail.job.startUrl}</h2>
            <Badge tone={detail.job.status === "completed" ? "green" : "amber"}>{detail.job.status}</Badge>
            {["queued", "running"].includes(detail.job.status) && (
              <Button onClick={runBatch} loading={busy}>Jalankan batch (5 URL)</Button>
            )}
            <Button
              variant="secondary"
              onClick={() => downloadFile(`/api/crawl/${detail.job.id}/export`, `crawl-${detail.job.id.slice(0, 8)}.csv`)}
            >
              Export CSV
            </Button>
          </div>

          {f && (
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Total halaman tercrawl", f.totalPages, ""],
                ["Error HTTP (≥400)", f.httpErrors.length, f.httpErrors.length ? "red" : "green"],
                ["Tanpa H1", f.missingH1.length, f.missingH1.length ? "amber" : "green"],
                ["Judul duplikat", f.duplicateTitles.length, f.duplicateTitles.length ? "amber" : "green"],
                ["Meta duplikat", f.duplicateDescriptions.length, f.duplicateDescriptions.length ? "amber" : "green"],
                ["Title kepanjangan", f.longTitles.length, f.longTitles.length ? "amber" : "green"],
                ["Noindex", f.noIndexPages.length, "slate"],
                ["Link internal tak ditemukan", f.unreachableInternalLinks.length, f.unreachableInternalLinks.length ? "amber" : "green"],
              ].map(([label, val, tone], i) => (
                <Card key={i}>
                  <CardBody className="py-3">
                    <p className="text-xs text-slate-500">{String(label)}</p>
                    <p className={`mt-0.5 text-xl font-semibold ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-800"}`}>{String(val)}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {f && (f.httpErrors.length > 0 || f.missingH1.length > 0 || f.canonicalMismatch.length > 0) && (
            <Card className="mb-6">
              <CardBody>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Detail temuan utama</h3>
                <div className="space-y-2 text-sm text-slate-600">
                  {f.httpErrors.slice(0, 20).map((e) => (
                    <p key={e.url}>• <Badge tone="red">{e.status}</Badge> {e.url}</p>
                  ))}
                  {f.missingH1.slice(0, 20).map((u) => (
                    <p key={u}>• Tanpa H1: {u}</p>
                  ))}
                  {f.canonicalMismatch.slice(0, 20).map((c) => (
                    <p key={c.url}>• Canonical ≠ URL: {c.url} → {c.canonical}</p>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          <h3 className="mb-2 text-sm font-semibold text-slate-800">Halaman ({detail.pages.length})</h3>
          <Table head={["Status", "URL", "Title", "Meta", "H1"]}>
            {detail.pages.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  <Badge tone={p.statusCode == null ? "slate" : p.statusCode >= 400 ? "red" : p.statusCode === 200 ? "green" : "amber"}>
                    {p.statusCode ?? "?"}
                  </Badge>
                </td>
                <td className="max-w-md truncate px-3 py-2 text-slate-700">{p.url}</td>
                <td className="max-w-xs truncate px-3 py-2 text-slate-600">{p.title ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{p.metaDescription ? `${[...p.metaDescription].length} kar.` : "—"}</td>
                <td className="px-3 py-2 text-slate-500">{p.h1s?.length ?? 0}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
      {!detail && jobs != null && jobs.length === 0 && (
        <EmptyState title="Belum ada hasil crawl" description="Buat job pertama untuk mengaudit title, meta, heading, kanonikal, dan struktur link." />
      )}
    </>
  );
}
