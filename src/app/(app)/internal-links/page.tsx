"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Label, PageHeader, Select, SpinnerBlock, Table } from "@/components/ui";

interface CrawlJobLite {
  id: string;
  startUrl: string;
  status: string;
  urlsDone: number;
}
interface AiRec {
  fromUrl: string;
  toUrl: string;
  anchor: string;
  reason: string;
  priority: string;
}
interface AiResult {
  recommendations: AiRec[];
  notes: string[];
  droppedHallucinated: number;
}
interface Result {
  deterministic: { orphanPages: string[]; thinLinkedPages: string[]; totalPages: number };
  ai: AiResult | null;
  note: string;
}

export default function InternalLinksPage() {
  const { projectId } = useActiveProject();
  const [jobs, setJobs] = useState<CrawlJobLite[]>([]);
  const [crawlJobId, setCrawlJobId] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const loadJobs = useCallback(async () => {
    if (!projectId) return;
    try {
      setJobs(await apiFetch<CrawlJobLite[]>(`/api/crawl?projectId=${projectId}`));
    } catch {
      setJobs([]);
    }
  }, [projectId]);

  useEffect(() => {
    setCrawlJobId("");
    setResult(null);
    void loadJobs();
  }, [loadJobs]);

  async function run() {
    if (!projectId || !crawlJobId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setOpenRow(null);
    try {
      setResult(await apiFetch<Result>("/api/internal-links", {
        method: "POST",
        body: JSON.stringify({ projectId, crawlJobId, useAi }),
      }));
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const doneJobs = jobs.filter((j) => j.status === "completed" || j.urlsDone > 0);

  return (
    <>
      <PageHeader
        title="Internal Link & Topical Authority"
        subtitle="Halaman yatim & link tipis dihitung deterministik dari crawl nyata; rekomendasi AI divalidasi terhadap URL yang benar-benar ada."
      />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="analisis membutuhkan hasil crawl project" /></div>

      <Card className="mb-6">
        <CardBody className="space-y-3">
          {doneJobs.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada hasil crawl untuk project ini. Jalankan <a className="underline" href="/crawl">Technical Crawler</a> terlebih dahulu.</p>
          ) : (
            <>
              <div className="max-w-xl">
                <Label htmlFor="cj">Sumber data crawl</Label>
                <Select id="cj" value={crawlJobId} onChange={(e) => setCrawlJobId(e.target.value)}>
                  <option value="">pilih job crawl…</option>
                  {doneJobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.startUrl} · {j.urlsDone} URL · {j.status}</option>
                  ))}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                Sertakan rekomendasi AI (1 request Gemini; tanpa ini tetap dapat analisis deterministik gratis)
              </label>
              <Button onClick={run} loading={busy} disabled={!crawlJobId}>Analisis internal link</Button>
            </>
          )}
        </CardBody>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      {busy && <SpinnerBlock label="Menganalisis…" />}

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Card><CardBody className="py-3"><p className="text-xs text-slate-500">Total halaman dianalisis</p><p className="text-xl font-semibold">{result.deterministic.totalPages}</p></CardBody></Card>
            <Card><CardBody className="py-3"><p className="text-xs text-slate-500">Halaman yatim (tanpa link masuk)</p><p className={`text-xl font-semibold ${result.deterministic.orphanPages.length ? "text-amber-600" : "text-emerald-600"}`}>{result.deterministic.orphanPages.length}</p></CardBody></Card>
            <Card><CardBody className="py-3"><p className="text-xs text-slate-500">Link tipis (1 masuk & ≤2 keluar)</p><p className="text-xl font-semibold text-slate-800">{result.deterministic.thinLinkedPages.length}</p></CardBody></Card>
          </div>

          {(result.deterministic.orphanPages.length > 0 || result.deterministic.thinLinkedPages.length > 0) && (
            <Card>
              <CardBody>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Daftar dari data crawl (tanpa AI)</h3>
                {result.deterministic.orphanPages.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-amber-700">Halaman yatim:</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-slate-600">{result.deterministic.orphanPages.map((u) => <li key={u}>• {u}</li>)}</ul>
                  </div>
                )}
                {result.deterministic.thinLinkedPages.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500">Halaman link tipis:</p>
                    <ul className="mt-1 space-y-0.5 text-sm text-slate-600">{result.deterministic.thinLinkedPages.slice(0, 30).map((u) => <li key={u}>• {u}</li>)}</ul>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {result.ai && (
            <Card>
              <CardBody>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">
                  Rekomendasi AI ({result.ai.recommendations.length})
                  {result.ai.droppedHallucinated > 0 && <span className="ml-2 text-xs font-normal text-amber-700">{result.ai.droppedHallucinated} rekomendasi dibuang karena URL tidak ada di data crawl</span>}
                </h3>
                {result.ai.recommendations.length === 0 ? (
                  <p className="text-sm text-slate-500">Tidak ada rekomendasi yang lolos validasi URL.</p>
                ) : (
                  <>
                  <p className="mb-2 text-xs text-slate-400">Klik baris untuk melihat URL lengkap dan detail.</p>
                  <Table head={["Dari", "Ke", "Anchor", "Prioritas", "Alasan"]}>
                    {result.ai.recommendations.map((r, i) => (
                      <Fragment key={i}>
                        <tr
                          className="cursor-pointer select-none hover:bg-slate-50"
                          onClick={() => setOpenRow(openRow === i ? null : i)}
                        >
                          <td className="max-w-52 truncate px-3 py-2 text-slate-600" title={r.fromUrl}>{r.fromUrl}</td>
                          <td className="max-w-52 truncate px-3 py-2 text-slate-600" title={r.toUrl}>{r.toUrl}</td>
                          <td className="px-3 py-2 text-slate-700">{r.anchor}</td>
                          <td className="px-3 py-2"><Badge tone={r.priority === "high" ? "red" : r.priority === "medium" ? "amber" : "slate"}>{r.priority}</Badge></td>
                          <td className="max-w-72 truncate px-3 py-2 text-slate-500" title={r.reason}>{r.reason}</td>
                        </tr>
                        {openRow === i && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={5} className="px-3 py-3">
                              <div className="grid gap-3 text-sm md:grid-cols-2">
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Dari (tambah link di halaman ini)</p>
                                  <a href={r.fromUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-start gap-1 break-all text-indigo-600 hover:underline">
                                    {r.fromUrl}<ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  </a>
                                </div>
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Ke (target link)</p>
                                  <a href={r.toUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-start gap-1 break-all text-indigo-600 hover:underline">
                                    {r.toUrl}<ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  </a>
                                </div>
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Anchor disarankan</p>
                                  <p className="mt-0.5 font-mono text-slate-700">&lt;a href=&quot;{r.toUrl}&quot;&gt;{r.anchor}&lt;/a&gt;</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Alasan lengkap</p>
                                  <p className="mt-0.5 text-slate-600">{r.reason}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </Table>
                  </>
                )}
                {result.ai.notes.length > 0 && (
                  <ul className="mt-3 list-disc pl-5 text-xs text-slate-500">{result.ai.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                )}
              </CardBody>
            </Card>
          )}
          <p className="text-xs text-slate-400">{result.note}</p>
        </div>
      )}
      {!result && !busy && doneJobs.length > 0 && (
        <EmptyState title="Belum ada analisis" description="Pilih job crawl lalu jalankan analisis." />
      )}
    </>
  );
}
