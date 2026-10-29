"use client";

import { useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, Input, PageHeader } from "@/components/ui";

interface IntelAi {
  intent: string;
  competition: string;
  difficultyEstimate: number;
  rationale: string[];
  contentAngles: string[];
  serpFeaturesLikely: string[];
  limitations: string[];
}
interface IntelResult {
  query: string;
  suggestions: string[];
  ai: IntelAi | null;
  aiError: string | null;
  disclaimer: string;
}

const INTENT_LABEL: Record<string, string> = {
  informational: "Informasi",
  commercial: "Komparasi / riset",
  transactional: "Transaksional",
  navigational: "Navigasional",
};

function kdTone(kd: number) {
  if (kd <= 39) return { bar: "bg-emerald-500", badge: "green" as const, label: "mudah (estimasi)" };
  if (kd <= 69) return { bar: "bg-amber-500", badge: "amber" as const, label: "menengah (estimasi)" };
  return { bar: "bg-red-500", badge: "red" as const, label: "sulit (estimasi)" };
}

export default function KeywordIntelPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntelResult | null>(null);

  async function lookup(term: string) {
    const t = term.trim();
    if (t.length < 2) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await apiFetch<IntelResult>(`/api/keywords/intel?q=${encodeURIComponent(t)}`));
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Keyword Intel"
        subtitle="Saran nyata Google Autocomplete + estimasi difficulty & persaingan oleh AI — transparan mana data nyata, mana estimasi."
      />

      <Card className="mb-6">
        <CardBody>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(q);
            }}
          >
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ketik kata kunci, mis. jasa pembuatan website…"
              className="sm:flex-1"
              aria-label="Kata kunci"
            />
            <Button type="submit" loading={busy} disabled={q.trim().length < 2}>
              <TrendingUp className="h-4 w-4" /> Riset
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Tekan Enter untuk riset. Klik saran di bawah hasil untuk menelusuri turunannya.
          </p>
        </CardBody>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      {result?.aiError && <Alert kind="info">{result.aiError}</Alert>}

      {result && (
        <div className="space-y-6">
          {/* Data nyata: autocomplete */}
          <Card>
            <CardBody>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold">Saran Google Autocomplete</h2>
                <Badge tone="green">data nyata</Badge>
              </div>
              {result.suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada saran untuk &ldquo;{result.query}&rdquo; di Google Indonesia.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {result.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setQ(s);
                        void lookup(s);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Search className="h-3 w-3 text-muted-foreground" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Saran muncul karena cukup banyak orang mengetiknya — sinyal permintaan nyata, bukan angka volume.
              </p>
            </CardBody>
          </Card>

          {/* Estimasi AI */}
          {result.ai && (
            <Card>
              <CardBody className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Analisis persaingan &amp; intent</h2>
                  <Badge tone="amber">estimasi AI — bukan metrik terukur</Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Keyword Difficulty (estimasi)</p>
                    <p className="mt-1 text-2xl font-semibold">{result.ai.difficultyEstimate}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${kdTone(result.ai.difficultyEstimate).bar}`} style={{ width: `${result.ai.difficultyEstimate}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{kdTone(result.ai.difficultyEstimate).label}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Level persaingan (estimasi)</p>
                    <p className="mt-1">
                      <Badge tone={result.ai.competition === "low" ? "green" : result.ai.competition === "medium" ? "amber" : "red"}>
                        {result.ai.competition}
                      </Badge>
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Perkiraan situs yang mendominasi hasil.</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Intent pencarian</p>
                    <p className="mt-1"><Badge tone="slate">{INTENT_LABEL[result.ai.intent] ?? result.ai.intent}</Badge></p>
                    <p className="mt-2 text-xs text-muted-foreground">Menentukan bentuk konten yang tepat (informasi vs jual).</p>
                  </div>
                </div>

                {result.ai.rationale.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Alasan estimasi</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {result.ai.rationale.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                )}

                {result.ai.contentAngles.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sudut konten yang bisa dikejar</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {result.ai.contentAngles.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                )}

                {result.ai.serpFeaturesLikely.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Fitur SERP yang kemungkinan muncul (estimasi)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.ai.serpFeaturesLikely.map((f) => <Badge key={f} tone="slate">{f}</Badge>)}
                    </div>
                  </div>
                )}

                {result.ai.limitations.length > 0 && (
                  <Alert kind="info">
                    <span className="font-medium">Keterbatasan: </span>{result.ai.limitations.join(" ")}
                  </Alert>
                )}
              </CardBody>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
        </div>
      )}
    </>
  );
}
