"use client";

import { Select, Label } from "./ui";
import { useActiveProject } from "@/lib/ui/use-projects";

/** Dropdown project aktif; tersinkron antar halaman via localStorage + event. */
export default function ProjectPicker({ requiredHint }: { requiredHint?: string }) {
  const { projectId, projects, loading, error, setProjectId } = useActiveProject();

  if (loading) return <p className="text-sm text-muted-foreground">Memuat project…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Belum ada project. Buat project terlebih dahulu di menu <a className="underline underline-offset-2" href="/projects">Projects</a>
        {requiredHint ? ` — ${requiredHint}` : ""}.
      </p>
    );
  }
  return (
    <div className="max-w-md">
      <Label htmlFor="project-picker">Project aktif</Label>
      <Select id="project-picker" value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} {p.domain ? `(${p.domain})` : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}

export { useActiveProject };
