"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, EmptyState, PageHeader, SpinnerBlock } from "@/components/ui";

interface ClusterKeyword {
  id: string;
  keyword: string;
}
interface Cluster {
  id: string;
  clusterName: string;
  intent: string | null;
  primaryKeyword: string | null;
  suggestedPageType: string | null;
  reasoning: string | null;
  targetPage: string | null;
  keywords: ClusterKeyword[];
}

export default function ClustersPage() {
  const { projectId } = useActiveProject();
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [unassigned, setUnassigned] = useState<{ id: string; keyword: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      const r = await apiFetch<{ clusters: Cluster[]; unassigned: { id: string; keyword: string }[] }>(
        `/api/clusters?projectId=${projectId}`,
      );
      setClusters(r.clusters);
      setUnassigned(r.unassigned);
    } catch (e) {
      setError(errMessage(e));
    }
  }, [projectId]);

  useEffect(() => {
    setClusters(null);
    void load();
  }, [load]);

  async function runClustering() {
    if (!projectId) return;
    if (!confirm("Jalankan AI clustering? Menggunakan 1 request Gemini (kuota global harian).")) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch<{ clusters: Cluster[]; unassigned: string[]; note: string }>("/api/seo/cluster", {
        method: "POST",
        body: JSON.stringify({ projectId }),
      });
      setNotice(`Selesai: ${r.clusters.length} cluster dibuat. ${r.unassigned.length} keyword belum terpetakan. ${r.note}`);
      await load();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function manage(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/clusters", { method: "POST", body: JSON.stringify(payload) });
      setNotice(okMsg);
      await load();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function rename(c: Cluster) {
    const name = prompt("Nama cluster baru:", c.clusterName);
    if (name && name.trim()) void manage({ action: "rename", clusterId: c.id, clusterName: name.trim() }, "Cluster diganti namanya.");
  }
  function del(c: Cluster) {
    if (confirm(`Hapus cluster "${c.clusterName}"? Keyword anggotanya kembali ke "belum terpetakan".`))
      void manage({ action: "delete_cluster", clusterId: c.id }, "Cluster dihapus.");
  }
  function moveKw(c: Cluster, kw: ClusterKeyword) {
    const others = clusters?.filter((x) => x.id !== c.id) ?? [];
    if (others.length === 0) {
      setNotice("Tidak ada cluster lain sebagai tujuan pindah.");
      return;
    }
    const target = prompt(`Pindahkan "${kw.keyword}" ke cluster (ketik nama persis):\n${others.map((o) => o.clusterName).join(" | ")}`);
    const dest = others.find((o) => o.clusterName === target?.trim());
    if (dest) void manage({ action: "move", keywordItemId: kw.id, toClusterId: dest.id }, "Keyword dipindahkan.");
  }

  return (
    <>
      <PageHeader
        title="AI Keyword Clustering"
        subtitle="Kelompokkan keyword per intent & topik. Hanya keyword dari input Anda yang bisa masuk cluster (divalidasi server)."
        actions={
          projectId ? (
            <Button onClick={runClustering} loading={busy}>Jalankan clustering (1 request AI)</Button>
          ) : undefined
        }
      />
      <div className="mb-5 max-w-md">
        <ProjectPicker requiredHint="clustering bekerja per project" />
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {!projectId ? (
        <EmptyState title="Pilih project" description="Pastikan keyword sudah ada di Keyword Workspace." />
      ) : clusters == null ? (
        <SpinnerBlock />
      ) : clusters.length === 0 ? (
        <EmptyState
          title="Belum ada cluster"
          description="Tambahkan keyword di Workspace lalu jalankan clustering. Hasil lama tetap dapat dilihat di Riwayat."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {clusters.map((c) => (
            <Card key={c.id}>
              <CardBody>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-800">{c.clusterName}</h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {c.intent && <Badge tone="indigo">{c.intent}</Badge>}
                      {c.suggestedPageType && <Badge tone="slate">{c.suggestedPageType}</Badge>}
                      {c.primaryKeyword && <Badge tone="green">primary: {c.primaryKeyword}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 text-xs">
                    <button onClick={() => rename(c)} className="rounded border px-1.5 py-0.5 text-slate-500 hover:bg-slate-50">rename</button>
                    <button onClick={() => del(c)} className="rounded border px-1.5 py-0.5 text-red-500 hover:bg-red-50">hapus</button>
                  </div>
                </div>
                {c.reasoning && <p className="mb-2 text-xs text-slate-500">{c.reasoning}</p>}
                <ul className="space-y-1">
                  {c.keywords.map((k) => (
                    <li key={k.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm text-slate-700">
                      {k.keyword}
                      <button onClick={() => moveKw(c, k)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">pindah →</button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">{c.keywords.length} keyword</p>
              </CardBody>
            </Card>
          ))}
          {unassigned.length > 0 && (
            <Card className="border-amber-200">
              <CardBody>
                <h3 className="font-semibold text-slate-800">Belum terpetakan ({unassigned.length})</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {unassigned.slice(0, 50).map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-2 rounded bg-amber-50 px-2 py-1">
                      <span>{k.keyword}</span>
                      <select
                        className="rounded border border-amber-200 bg-white px-1.5 py-0.5 text-xs"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) void manage({ action: "move", keywordItemId: k.id, toClusterId: e.target.value }, `"${k.keyword}" dipindahkan.`);
                        }}
                      >
                        <option value="">pindah ke…</option>
                        {(clusters ?? []).map((c) => (
                          <option key={c.id} value={c.id}>{c.clusterName}</option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">Pindahkan keyword satu per satu ke cluster yang sesuai, atau jalankan clustering ulang.</p>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
