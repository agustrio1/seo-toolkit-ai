"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface ProjectRow {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  archived: boolean;
  createdAt: string;
}

const STORAGE_KEY = "seo_active_project";
const EVENT = "seo:project-changed";

/** Project aktif disimpan di localStorage dan disinkronkan antar komponen. */
export function useActiveProject() {
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // Server sudah menyaring project yang diarsipkan.
      const active = await apiFetch<ProjectRow[]>("/api/projects");
      setProjects(active);
      setError(null);
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const valid = stored && active.some((p) => p.id === stored);
      if (!valid && active.length > 0) {
        localStorage.setItem(STORAGE_KEY, active[0].id);
        window.dispatchEvent(new Event(EVENT));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat project.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sync = () => setProjectIdState(localStorage.getItem(STORAGE_KEY));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    void refresh();
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [refresh]);

  const setProjectId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { projectId, projects, loading, error, refresh, setProjectId };
}
