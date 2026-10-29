"use client";

import { useState, type FormEvent } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, Input, Label, PageHeader, Textarea } from "@/components/ui";

interface Deterministic {
  wordCount: number;
  charCount: number;
  exactKeywordOccurrences: number;
  keywordDensityPercent: number;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  emptyHeadings: number;
  titleLength?: number;
  metaDescriptionLength?: number;
  imagesTotal: number;
  imagesWithoutAlt: number;
  linksFound: number;
  isHtml: boolean;
}
interface Ai {
  seoScore: number;
  verdict: string;
  keywordDensityStatus: string;
  intentAssessment: string;
  contentCoverage: { coveredSubtopics: string[]; missingSubtopics: string[] };
  lsiKeywordsSuggested: string[];
  actionableImprovements: { title: string; explanation: string; priority: string; reason: string; location?: string; suggestedAction: string }[];
  readabilityNotes: string;
  limitations: string[];
}

export default function AnalyzerPage() {
  const { projectId } = useActiveProject();
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [secondary, setSecondary] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deterministic: Deterministic; ai: Ai; note: string } | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiFetch<{ deterministic: Deterministic; ai: Ai; note: string }>("/api/seo/analyze", {
        method: "POST",
        body: JSON.stringify({
          ...(projectId ? { projectId } : {}),
          keyword,
          content,
          ...(title ? { title } : {}),
          ...(secondary ? { secondaryKeywords: secondary } : {}),
        }),
      });
      setResult(r);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const d = result?.deterministic;
  const verdictTone: Record<string, "green" | "indigo" | "amber" | "red"> = {
    strong: "green",
    adequate: "indigo",
    needs_work: "amber",
    weak: "red",
  };

  return (
    <>
      <PageHeader
        title="SEO Content Analyzer"
        subtitle="Pemeriksaan deterministik (angka nyata dari teks) + penilaian AI. Skor AI adalah rekomendasi, bukan skor Google."
      />
      <div className="mb-5 max-w-md">
        <ProjectPicker requiredHint="hasil analisis akan tersimpan ke project ini" />
      </div>

      <Card className="mb-6">
        <CardBody>
          <form onSubmit={run} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="kw">Focus keyword *</Label>
                <Input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} required minLength={2} maxLength={300} />
              </div>
              <div>
                <Label htmlFor="title">Title tag (opsional)</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
              </div>
            </div>
            <div>
              <Label htmlFor="sec">Keyword sekunder (pisahkan koma, opsional)</Label>
              <Input id="sec" value={secondary} onChange={(e) => setSecondary(e.target.value)} maxLength={1000} />
            </div>
            <div>
              <Label htmlFor="content">Konten (HTML atau teks, minimal 50 karakter) *</Label>
              <Textarea id="content" rows={12} value={content} onChange={(e) => setContent(e.target.value)} required minLength={50} maxLength={100000} />
              <p className="mt-1 text-xs text-slate-500">{content.length} / 100.000 karakter</p>
            </div>
            <Button type="submit" loading={busy} disabled={content.length < 50 || keyword.length < 2}>
              Analisis (1 request AI)
            </Button>
          </form>
        </CardBody>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}

      {result && d && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Hasil pemeriksaan deterministik</h2>
              <ul className="space-y-1.5 text-sm text-slate-600">
                <li>Jumlah kata: <b>{d.wordCount}</b> · karakter: <b>{d.charCount}</b></li>
                <li>Kemunculan exact keyword: <b>{d.exactKeywordOccurrences}</b> · densitas: <b>{d.keywordDensityPercent}%</b></li>
                <li>Title length: <b>{d.titleLength ?? "tidak diberikan"}</b> · meta length: <b>{d.metaDescriptionLength ?? "tidak diberikan"}</b></li>
                {d.isHtml ? (
                  <>
                    <li>H1: <b>{d.h1Count}</b> · H2: <b>{d.h2Count}</b> · H3: <b>{d.h3Count}</b> · heading kosong: <b>{d.emptyHeadings}</b></li>
                    <li>Gambar: <b>{d.imagesTotal}</b> tanpa alt: <b>{d.imagesWithoutAlt}</b> · link: <b>{d.linksFound}</b></li>
                  </>
                ) : (
                  <li className="text-amber-700">Konten teks biasa — struktur heading/gambar tidak dapat disimpulkan.</li>
                )}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Penilaian AI</h2>
                <div className="flex items-center gap-2">
                  <Badge tone={verdictTone[result.ai.verdict] ?? "slate"}>{result.ai.verdict.replace(/_/g, " ")}</Badge>
                  <span className="text-lg font-bold text-slate-900">{result.ai.seoScore}/100</span>
                </div>
              </div>
              <p className="text-sm text-slate-600">{result.ai.intentAssessment}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-medium text-slate-700">Subtopik tercakup</p>
                  <ul className="mt-1 list-disc pl-4 text-slate-600">{result.ai.contentCoverage.coveredSubtopics.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Subtopik yang hilang</p>
                  <ul className="mt-1 list-disc pl-4 text-slate-600">{result.ai.contentCoverage.missingSubtopics.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              </div>
              {result.ai.lsiKeywordsSuggested.length > 0 && (
                <p className="mt-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Saran kata terkait:</span> {result.ai.lsiKeywordsSuggested.join(", ")}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">{result.note}</p>
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Rekomendasi perbaikan ({result.ai.actionableImprovements.length})</h2>
              <ol className="space-y-3">
                {result.ai.actionableImprovements.map((imp, i) => (
                  <li key={i} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone={imp.priority === "high" ? "red" : imp.priority === "medium" ? "amber" : "slate"}>{imp.priority}</Badge>
                      <span className="font-medium text-slate-800">{imp.title}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{imp.explanation}</p>
                    <p className="mt-1 text-slate-600"><b>Aksi:</b> {imp.suggestedAction}</p>
                    {imp.location && <p className="mt-1 text-xs text-slate-400">Lokasi: {imp.location}</p>}
                  </li>
                ))}
              </ol>
              {result.ai.limitations.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-500">Keterbatasan yang diakui model:</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-400">
                    {result.ai.limitations.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
