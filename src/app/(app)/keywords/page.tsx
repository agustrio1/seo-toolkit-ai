"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, apiFetchPaged, downloadFile, errMessage } from "@/lib/ui/api";
import {
  Alert, Badge, Button, Card, CardBody, EmptyState, Input, Label, PageHeader, Select, SpinnerBlock, Table, Textarea,
} from "@/components/ui";

interface KeywordRow {
  id: string;
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  cpc: string | null;
  intent: string | null;
  dataSource: string | null;
  targetPage: string | null;
  notes: string | null;
  createdAt: string;
}

const INTENTS = ["", "informational", "commercial", "transactional", "navigational"] as const;

export default function KeywordsPage() {
  const { projectId } = useActiveProject();
  const [tab, setTab] = useState<"list" | "add" | "import">("list");

  // daftar
  const [rows, setRows] = useState<KeywordRow[] | null>(null);
  const [meta, setMeta] = useState({ page: 1, perPage: 50, total: 0 });
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState("");
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState<string | null>(null);

  // tambah
  const [bulkText, setBulkText] = useState("");
  const [listName, setListName] = useState("");
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // import
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setListError(null);
    try {
      const params = new URLSearchParams({ projectId, page: String(page), perPage: "50" });
      if (q) params.set("q", q);
      if (intent) params.set("intent", intent);
      const res = await apiFetchPaged<KeywordRow[]>(`/api/keywords?${params}`);
      setRows(res.data);
      setMeta(res.pagination);
    } catch (e) {
      setListError(errMessage(e));
    }
  }, [projectId, page, q, intent]);

  useEffect(() => {
    setRows(null);
    setPage(1);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function addKeywords(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    const items = bulkText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 1000)
      .map((keyword) => ({ keyword, ...(listName ? { listName } : {}) }));
    if (items.length === 0) {
      setAddMsg("Tidak ada keyword untuk ditambahkan.");
      return;
    }
    setBusy(true);
    setAddMsg(null);
    try {
      const r = await apiFetch<{ added: number; skippedDuplicates: number }>("/api/keywords", {
        method: "POST",
        body: JSON.stringify({ projectId, items }),
      });
      setAddMsg(`Ditambahkan ${r.added}, dilewati (duplikat) ${r.skippedDuplicates}. Volume/difficulty/CPC kosong karena tidak dikirim — isi lewat CSV agar datanya jelas sumbernya.`);
      setBulkText("");
      await load();
    } catch (err) {
      setAddMsg(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runImport(doPreview: boolean) {
    if (!projectId || !csvText) return;
    setBusy(true);
    setImportMsg(null);
    setPreview(null);
    try {
      const r = await apiFetch<Record<string, unknown>>("/api/keywords/import", {
        method: "POST",
        body: JSON.stringify({ projectId, csv: csvText, listName: listName || "Import CSV", preview: doPreview }),
      });
      if (doPreview) setPreview(r);
      else {
        setImportMsg(`Import selesai: ${String(r.added ?? 0)} ditambahkan, ${String(r.skippedExisting ?? 0)} sudah ada sebelumnya.`);
        setCsvText("");
        await load();
      }
    } catch (err) {
      setImportMsg(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus keyword ini?")) return;
    try {
      await apiFetch(`/api/keywords/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setListError(errMessage(e));
    }
  }

  function onFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(f);
  }

  return (
    <>
      <PageHeader
        title="Keyword Workspace"
        subtitle="Daftar keyword per project. Angka volume/difficulty/CPC hanya tampil bila Anda yang mengirimnya."
        actions={
          projectId ? (
            <Button
              variant="secondary"
              onClick={() => downloadFile(`/api/keywords/export?projectId=${projectId}`, "keywords.csv").catch((e) => setListError(errMessage(e)))}
            >
              Export CSV
            </Button>
          ) : undefined
        }
      />
      <div className="mb-5">
        <ProjectPicker />
      </div>

      <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
        {(["list", "add", "import"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === t ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "list" ? "Daftar" : t === "add" ? "Tambah" : "Import CSV"}
          </button>
        ))}
      </div>

      {listError && <Alert kind="error">{listError}</Alert>}

      {!projectId ? (
        <EmptyState title="Pilih project terlebih dahulu" description="Keyword selalu berada dalam satu project." />
      ) : tab === "list" ? (
        rows == null ? (
          <SpinnerBlock />
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada keyword" description="Tambahkan manual atau import CSV dari tool riset Anda (Ahrefs/Semrush/GSC dsb.)." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Input placeholder="Cari keyword…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="max-w-xs" />
              <Select value={intent} onChange={(e) => { setIntent(e.target.value); setPage(1); }} className="max-w-48">
                {INTENTS.map((v) => (
                  <option key={v} value={v}>{v || "Semua intent"}</option>
                ))}
              </Select>
            </div>
            <Table head={["Keyword", "Volume", "KD", "CPC", "Intent", "Sumber", ""]}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-slate-800">{r.keyword}</td>
                  <td className="px-3 py-2">{r.volume ?? <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2">{r.difficulty ?? <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2">{r.cpc ?? <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2">{r.intent ? <Badge tone="indigo">{r.intent}</Badge> : <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{r.dataSource ?? "input user"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(r.id)} className="text-xs text-red-600 hover:underline">hapus</button>
                  </td>
                </tr>
              ))}
            </Table>
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-500">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">← Prev</button>
              <span>Hal {meta.page} / total {meta.total} keyword</span>
              <button disabled={rows.length < 50} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Next →</button>
            </div>
          </>
        )
      ) : tab === "add" ? (
        <Card className="max-w-2xl">
          <CardBody>
            <form onSubmit={addKeywords} className="space-y-3">
              <div>
                <Label htmlFor="bulk">Keyword (satu per baris, maks 1000)</Label>
                <Textarea id="bulk" rows={10} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"jasa seo jakarta\nharga website tokopedia\ncara riset keyword"} />
              </div>
              <div>
                <Label htmlFor="lname">Nama list (opsional)</Label>
                <Input id="lname" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="Riset Okt 2026" />
              </div>
              <Button type="submit" loading={busy}>Tambahkan</Button>
            </form>
            {addMsg && <div className="mt-3"><Alert kind="info">{addMsg}</Alert></div>}
          </CardBody>
        </Card>
      ) : (
        <Card className="max-w-3xl">
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Kolom wajib: <code className="rounded bg-slate-100 px-1">keyword</code>. Opsional: <code className="rounded bg-slate-100 px-1">volume, difficulty, cpc, data_source, data_date, intent, target_page, notes, tags</code>.
              Batas: 2 MB / 5000 baris. Sel formula (diawali <code>=</code> dll.) dinetralisasi otomatis.
            </p>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <Textarea rows={6} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder="…atau tempel isi CSV di sini" />
            <div className="flex gap-2">
              <Button variant="secondary" disabled={!csvText || busy} loading={busy} onClick={() => runImport(true)}>Pratinjau</Button>
              <Button disabled={!csvText || busy} onClick={() => runImport(false)}>Import & Simpan</Button>
            </div>
            {importMsg && <Alert kind="success">{importMsg}</Alert>}
            {preview != null && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <p>Total baris: {String(preview.totalRows ?? 0)} · Valid: {String(preview.validRows ?? 0)} · Duplikat dalam file: {String(preview.duplicatesInFile ?? 0)}</p>
                {Array.isArray(preview.invalidRows) && (preview.invalidRows as string[]).length > 0 && (
                  <p className="mt-1 text-amber-700">Baris tidak valid (contoh): {(preview.invalidRows as string[]).join(" | ")}</p>
                )}
                {Array.isArray(preview.parseErrors) && (preview.parseErrors as string[]).length > 0 && (
                  <p className="mt-1 text-red-700">Error parse: {(preview.parseErrors as string[]).join(" | ")}</p>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
