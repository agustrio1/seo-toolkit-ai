"use client";

import { useState, type FormEvent } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Badge, Button, Card, CardBody, Input, Label, PageHeader, Textarea } from "@/components/ui";

interface Geo {
  readinessScore: number;
  answerClarity: string;
  questionAnswerStructure: { question: string; assessment: string }[];
  entityConsistency: { strong: string[]; weak: string[] };
  schemaFindings: { schemaType: string; status: string; note: string }[];
  citationSuggestions: string[];
  readabilityImprovements: string[];
  summaryAnswer: string;
  limitations: string[];
}

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate"> = {
  present_valid_structure: "green",
  present_incomplete: "amber",
  missing_recommended: "slate",
  invalid_json_ld: "red",
};

export default function GeoPage() {
  const { projectId } = useActiveProject();
  const [keyword, setKeyword] = useState("");
  const [content, setContent] = useState("");
  const [businessInfo, setBusinessInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ geo: Geo; schemaTypesFound: string[]; note: string } | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await apiFetch<{ geo: Geo; schemaTypesFound: string[]; note: string }>("/api/geo/analyze", {
        method: "POST",
        body: JSON.stringify({ projectId, keyword, content, ...(businessInfo ? { businessInfo } : {}) }),
      }));
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const g = result?.geo;

  return (
    <>
      <PageHeader
        title="GEO & AI Search Assistant"
        subtitle="Nilai kesiapan konten untuk mesin jawaban generatif (AI Overviews, chatbot). Deteksi JSON-LD dilakukan nyata dari konten, bukan tebakan."
      />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="analisis GEO per project" /></div>

      <Card className="mb-6">
        <CardBody>
          <form onSubmit={run} className="space-y-3">
            <div><Label htmlFor="kw">Pertanyaan / keyword target *</Label><Input id="kw" value={keyword} onChange={(e) => setKeyword(e.target.value)} required minLength={2} placeholder="berapa biaya membuat website toko online" /></div>
            <div><Label htmlFor="biz">Info bisnis (fakta, opsional)</Label><Textarea id="biz" rows={2} value={businessInfo} onChange={(e) => setBusinessInfo(e.target.value)} maxLength={2000} /></div>
            <div>
              <Label htmlFor="content">Konten halaman (HTML, minimal 50 karakter) *</Label>
              <Textarea id="content" rows={10} value={content} onChange={(e) => setContent(e.target.value)} required minLength={50} maxLength={80000} />
              <p className="mt-1 text-xs text-slate-500">{content.length} / 80.000 karakter</p>
            </div>
            <Button type="submit" loading={busy} disabled={!projectId || content.length < 50}>Analisis kesiapan GEO (1 request AI)</Button>
          </form>
        </CardBody>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}

      {g && result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardBody>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Skor kesiapan</h2>
                <span className="text-2xl font-bold text-slate-900">{g.readinessScore}/100</span>
              </div>
              <p className="text-sm text-slate-600">{g.answerClarity}</p>
              <p className="mt-3 rounded-md bg-slate-50 p-2 text-sm text-slate-700"><b>Jawaban ringkas yang disarankan:</b> {g.summaryAnswer}</p>
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-700">JSON-LD terdeteksi nyata dari konten:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {result.schemaTypesFound.length > 0 ? result.schemaTypesFound.map((t) => <Badge key={t} tone="green">{t}</Badge>) : <Badge tone="slate">tidak ada schema terdeteksi</Badge>}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">{result.note}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Temuan schema & konsistensi entitas</h2>
              <ul className="space-y-1.5">
                {g.schemaFindings.map((s) => (
                  <li key={s.schemaType} className="flex items-start gap-2 text-sm">
                    <Badge tone={STATUS_TONE[s.status] ?? "slate"}>{s.status.replace(/_/g, " ")}</Badge>
                    <span className="text-slate-600"><b>{s.schemaType}</b> — {s.note}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-medium text-emerald-700">Entitas kuat:</p>
                  <ul className="list-disc pl-4 text-slate-600">{g.entityConsistency.strong.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
                <div>
                  <p className="font-medium text-amber-700">Entitas lemah:</p>
                  <ul className="list-disc pl-4 text-slate-600">{g.entityConsistency.weak.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardBody>
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Struktur Q&A, saran sitasi & keterbatasan</h2>
              <div className="grid gap-4 md:grid-cols-3 text-sm">
                <div>
                  <p className="font-medium text-slate-700">Penilaian Q&A:</p>
                  <ul className="mt-1 space-y-1 text-slate-600">
                    {g.questionAnswerStructure.map((qa, i) => (
                      <li key={i}><b>{qa.question}</b><br />{qa.assessment}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Saran agar mudah dikutip AI:</p>
                  <ul className="mt-1 list-disc pl-4 text-slate-600">{g.citationSuggestions.map((s) => <li key={s}>{s}</li>)}</ul>
                  <p className="mt-2 font-medium text-slate-700">Perbaikan keterbacaan:</p>
                  <ul className="mt-1 list-disc pl-4 text-slate-600">{g.readabilityImprovements.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
                <div>
                  <p className="font-medium text-slate-700">Keterbatasan (diakui model):</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-500">{g.limitations.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
