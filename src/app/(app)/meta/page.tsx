"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Label, PageHeader, Select, SpinnerBlock, Textarea } from "@/components/ui";

interface MetaVar {
  title: string;
  description: string;
  titleLength: number;
  descriptionLength: number;
  valid: boolean;
}
interface Job {
  id: string;
  status: string;
  totalItems: number;
  processedItems: number;
  failedItems: number;
}
interface JobItem {
  id: string;
  ordinal: number;
  status: string;
  payload: { keyword?: string };
  result: { variations?: MetaVar[] } | null;
  error: string | null;
}

export default function MetaPage() {
  const { projectId } = useActiveProject();
  const [tab, setTab] = useState<"single" | "bulk">("single");

  // single
  const [keyword, setKeyword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [audience, setAudience] = useState("");
  const [style, setStyle] = useState("");
  const [single, setSingle] = useState<MetaVar[] | null>(null);

  // bulk
  const [bulkText, setBulkText] = useState("");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [activeJob, setActiveJob] = useState<{ job: Job; items: JobItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setJobs(await apiFetch<Job[]>("/api/jobs"));
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function runSingle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSingle(null);
    try {
      const r = await apiFetch<{ variations: MetaVar[] }>("/api/meta/generate", {
        method: "POST",
        body: JSON.stringify({
          ...(projectId ? { projectId } : {}),
          keyword,
          ...(businessName ? { businessName } : {}),
          ...(audience ? { audience } : {}),
          ...(style ? { style } : {}),
        }),
      });
      setSingle(r.variations);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createJob() {
    if (!projectId) return;
    const items = bulkText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30)
      .map((kw) => {
        const [keyword, pageUrl] = kw.split("|").map((x) => x.trim());
        return { keyword, ...(pageUrl ? { pageUrl } : {}) };
      });
    if (items.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch<{ job: Job }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          type: "meta_generation",
          items,
          config: { ...(businessName ? { businessName } : {}), ...(audience ? { audience } : {}), ...(style ? { style } : {}) },
        }),
      });
      setNotice(`Job dibuat dengan ${r.job.totalItems} item. Klik "Jalankan batch" — tiap batch memproses 3 item (ramah kuota).`);
      setBulkText("");
      await loadJobs();
      await openJob(r.job.id);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openJob(id: string) {
    try {
      setActiveJob(await apiFetch<{ job: Job; items: JobItem[] }>(`/api/jobs/${id}`));
    } catch (e) {
      setError(errMessage(e));
    }
  }

  async function runBatch() {
    if (!activeJob) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ batchProcessed: number; quotaHit: boolean; finished: boolean; message?: string }>(
        `/api/jobs/${activeJob.job.id}/run`,
        { method: "POST" },
      );
      if (r.quotaHit) setNotice(r.message ?? "Kuota tercapai, coba lagi sebentar.");
      else if (r.finished) setNotice("Semua item selesai diproses.");
      else setNotice(`Batch memproses ${r.batchProcessed} item. Jalankan batch berikutnya.`);
      await openJob(activeJob.job.id);
      await loadJobs();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob() {
    if (!activeJob || !confirm("Batalkan job? Item yang belum diproses tidak akan dijalankan.")) return;
    setBusy(true);
    try {
      await apiFetch(`/api/jobs/${activeJob.job.id}/cancel`, { method: "POST" });
      await openJob(activeJob.job.id);
      await loadJobs();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Bulk Meta Generator"
        subtitle="Title ≤60 & description ≤150 karakter divalidasi server; hasil yang melanggar ditandai, tidak pernah dipotong diam-diam."
      />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="diperlukan untuk job bulk" /></div>
      <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
        <button onClick={() => setTab("single")} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === "single" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>Satu keyword</button>
        <button onClick={() => setTab("bulk")} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === "bulk" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>Bulk job</button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <div className="mb-4"><Alert kind="info">{notice}</Alert></div>}

      {tab === "single" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardBody>
              <form onSubmit={runSingle} className="space-y-3">
                <div><Label htmlFor="kw">Keyword *</Label><Input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} required minLength={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="biz">Nama bisnis</Label><Input id="biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={200} /></div>
                  <div><Label htmlFor="aud">Audiens</Label><Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={300} /></div>
                </div>
                <div>
                  <Label htmlFor="style">Gaya</Label>
                  <Select id="style" value={style} onChange={(e) => setStyle(e.target.value)}>
                    <option value="">netral</option><option>profesional</option><option>santai</option><option>urgency (tanpa klikbaity)</option>
                  </Select>
                </div>
                <Button type="submit" loading={busy}>Generate 3 variasi (1 request AI)</Button>
              </form>
            </CardBody>
          </Card>
          {single && (
            <div className="space-y-3">
              {single.map((v, i) => (
                <Card key={i} className={v.valid ? "" : "border-amber-300"}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800">{v.title}</p>
                      <Badge tone={v.valid ? "green" : "amber"}>{v.titleLength}/60</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{v.description}</p>
                    <p className="mt-1 text-xs text-slate-400">deskripsi {v.descriptionLength}/150 {v.valid ? "" : "— melebihi batas, sunting manual"}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardBody className="space-y-3">
                <p className="text-sm text-slate-600">Satu keyword per baris (maks 30). Format opsional: <code className="rounded bg-slate-100 px-1">keyword | url-halaman</code>.</p>
                <Textarea rows={8} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"jasa seo jakarta\nkomponen website murah | /blog/komponen-website"} />
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="mbiz">Nama bisnis</Label><Input id="mbiz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></div>
                  <div><Label htmlFor="mstyle">Gaya</Label><Input id="mstyle" value={style} onChange={(e) => setStyle(e.target.value)} /></div>
                </div>
                <Button onClick={createJob} loading={busy} disabled={!projectId}>Buat job bulk</Button>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <h2 className="mb-2 text-sm font-semibold text-slate-800">Job terakhir</h2>
                {jobs == null ? <SpinnerBlock label="Memuat job…" /> : jobs.length === 0 ? <p className="text-sm text-slate-500">Belum ada job.</p> : (
                  <ul className="space-y-1.5">
                    {jobs.slice(0, 8).map((j) => (
                      <li key={j.id}>
                        <button onClick={() => openJob(j.id)} className="flex w-full items-center justify-between rounded border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-50">
                          <span className="text-slate-700">{j.processedItems}/{j.totalItems} item{j.failedItems > 0 ? ` · ${j.failedItems} gagal` : ""}</span>
                          <Badge tone={j.status === "completed" ? "green" : j.status === "failed" ? "red" : j.status === "cancelled" ? "slate" : "amber"}>{j.status}</Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
          {activeJob ? (
            <Card>
              <CardBody>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">
                    Job: {activeJob.job.processedItems}/{activeJob.job.totalItems} · status <Badge tone={activeJob.job.status === "completed" ? "green" : "amber"}>{activeJob.job.status}</Badge>
                  </h2>
                  <div className="flex gap-2">
                    {["queued", "running"].includes(activeJob.job.status) && (
                      <>
                        <Button onClick={runBatch} loading={busy} className="px-3 py-1.5 text-xs">Jalankan batch (3 item)</Button>
                        <Button variant="danger" onClick={cancelJob} className="px-3 py-1.5 text-xs">Batalkan</Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="max-h-[480px] space-y-3 overflow-y-auto">
                  {activeJob.items.map((it) => (
                    <div key={it.id} className="rounded-md border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800">{it.payload.keyword}</p>
                        <Badge tone={it.status === "completed" ? "green" : it.status === "failed" ? "red" : it.status === "running" ? "amber" : "slate"}>{it.status}</Badge>
                      </div>
                      {it.error && <p className="mt-1 text-xs text-red-600">{it.error}</p>}
                      {it.result?.variations?.map((v, i) => (
                        <div key={i} className="mt-2 rounded bg-slate-50 p-2 text-xs">
                          <p className="font-medium text-slate-700">{v.title} <span className="text-slate-400">({v.titleLength})</span></p>
                          <p className="text-slate-600">{v.description} <span className="text-slate-400">({v.descriptionLength})</span></p>
                          {!v.valid && <p className="mt-0.5 text-amber-700">Melebihi batas — sunting manual sebelum dipakai.</p>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : (
            <EmptyState title="Pilih atau buat job" description="Job diproses per batch 3 item agar tidak melewati batas per-menit tier gratis." />
          )}
        </div>
      )}
    </>
  );
}
