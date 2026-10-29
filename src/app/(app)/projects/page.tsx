"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, errMessage } from "@/lib/ui/api";
import type { ProjectRow } from "@/lib/ui/use-projects";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Label, PageHeader, SpinnerBlock, Table, Textarea } from "@/components/ui";

export default function ProjectsPage() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await apiFetch<ProjectRow[]>("/api/projects"));
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, domain, description: description || undefined }),
      });
      setName("");
      setDomain("");
      setDescription("");
      await load();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    if (!confirm("Arsip project ini? Data terkait tetap tersimpan; project hilang dari daftar aktif.")) return;
    setError(null);
    try {
      await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Projects" subtitle="Satu project = satu situs/domain. Semua modul bekerja dalam konteks project." />
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody>
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Buat project baru</h2>
            <form onSubmit={create} className="space-y-3">
              <div>
                <Label htmlFor="p-name">Nama</Label>
                <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={200} placeholder="Toko Online Saya" />
              </div>
              <div>
                <Label htmlFor="p-domain">Domain</Label>
                <Input id="p-domain" value={domain} onChange={(e) => setDomain(e.target.value)} required placeholder="tokosaya.com" />
                <p className="mt-1 text-xs text-slate-500">Dipakai crawler sebagai batas internal domain.</p>
              </div>
              <div>
                <Label htmlFor="p-desc">Deskripsi (opsional)</Label>
                <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
              </div>
              <Button type="submit" loading={busy}>Simpan project</Button>
            </form>
          </CardBody>
        </Card>
        <div className="lg:col-span-2">
          {rows == null ? (
            <SpinnerBlock />
          ) : rows.length === 0 ? (
            <EmptyState title="Belum ada project" description="Buat project pertama Anda di formulir ini." />
          ) : (
            <Table head={["Nama", "Domain", "Dibuat", ""]}>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{p.name}</td>
                  <td className="px-3 py-2.5 text-slate-600">{p.domain ?? <Badge tone="slate">—</Badge>}</td>
                  <td className="px-3 py-2.5 text-slate-500">{new Date(p.createdAt).toLocaleDateString("id-ID")}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="danger" onClick={() => archive(p.id)} className="px-2.5 py-1 text-xs">
                      Arsipkan
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Penghapusan permanen sengaja tidak disediakan dari layar ini agar riwayat analisis tidak rusak — project diarsipkan (soft-delete).
          </p>
        </div>
      </div>
    </>
  );
}
