"use client";

import { useState, type FormEvent } from "react";
import ProjectPicker from "@/components/project-picker";
import { useActiveProject } from "@/lib/ui/use-projects";
import { apiFetch, errMessage } from "@/lib/ui/api";
import { Alert, Button, Card, CardBody, Input, Label, PageHeader, Select, Textarea } from "@/components/ui";

interface Brief {
  objective: string;
  searchIntent: string;
  audienceProfile: string;
  suggestedH1: string;
  outline: { heading: string; level: number; points: string[] }[];
  questionsToAnswer: string[];
  entitiesAndSubtopics: string[];
  factsToVerify: string[];
  internalLinkIdeas: string[];
  ctaSuggestion: string;
}
interface Article {
  title: string;
  metaTitle: string;
  metaDescription: string;
  sections: { heading: string; markdown: string }[];
  faq: { question: string; answer: string }[];
  conclusion: string;
  cta: string;
  claimsToVerify: string[];
}

function toMarkdown(a: Article): string {
  const parts = [`# ${a.title}`];
  for (const s of a.sections) parts.push(`## ${s.heading}\n\n${s.markdown}`);
  if (a.faq.length) parts.push(`## FAQ\n\n${a.faq.map((f) => `**${f.question}**\n\n${f.answer}`).join("\n\n")}`);
  parts.push(`## Kesimpulan\n\n${a.conclusion}`, `CTA: ${a.cta}`);
  return parts.join("\n\n");
}

export default function ContentPage() {
  const { projectId } = useActiveProject();
  const [tab, setTab] = useState<"brief" | "article">("brief");

  // brief input
  const [topic, setTopic] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState("");
  const [audience, setAudience] = useState("");
  const [intent, setIntent] = useState("");
  const [pageGoal, setPageGoal] = useState("");
  const [contentType, setContentType] = useState("");
  const [businessInfo, setBusinessInfo] = useState("");

  const [brief, setBrief] = useState<Brief | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [targetWords, setTargetWords] = useState(800);
  const [regenHeading, setRegenHeading] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function makeBrief(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch<{ brief: Brief; note: string }>("/api/content/brief", {
        method: "POST",
        body: JSON.stringify({
          projectId, topic, primaryKeyword,
          ...(secondaryKeywords ? { secondaryKeywords } : {}),
          ...(audience ? { audience } : {}),
          ...(intent ? { intent } : {}),
          ...(pageGoal ? { pageGoal } : {}),
          ...(contentType ? { contentType } : {}),
          ...(businessInfo ? { businessInfo } : {}),
        }),
      });
      setBrief(r.brief);
      setNotice(r.note);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function makeArticle(regenerate = false) {
    if (!projectId || (!brief && !article)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiFetch<{ article: Article; articleId: string; note: string }>("/api/content/generate", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          briefJson: JSON.stringify(brief),
          targetWords,
          ...(regenerate && regenHeading ? { regenerateHeading: regenHeading, previousArticleId: articleId ?? undefined } : {}),
        }),
      });
      setArticle(r.article);
      setArticleId(r.articleId);
      setNotice(r.note);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI Content Studio"
        subtitle="Brief konten lalu draf artikel per bagian. Semua klaim faktual ditandai untuk diverifikasi manual."
      />
      <div className="mb-5 max-w-md"><ProjectPicker requiredHint="brief & artikel disimpan ke project ini" /></div>
      <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
        <button onClick={() => setTab("brief")} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === "brief" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>1. Brief</button>
        <button onClick={() => setTab("article")} className={`rounded-md px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${tab === "article" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`} disabled={!brief}>2. Artikel</button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <div className="mb-4"><Alert kind="info">{notice}</Alert></div>}

      {tab === "brief" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardBody>
              <form onSubmit={makeBrief} className="space-y-3">
                <div><Label htmlFor="topic">Topik *</Label><Input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} required minLength={3} /></div>
                <div><Label htmlFor="pkw">Keyword utama *</Label><Input id="pkw" value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} required minLength={2} /></div>
                <div><Label htmlFor="skw">Keyword sekunder (opsional)</Label><Textarea id="skw" rows={2} value={secondaryKeywords} onChange={(e) => setSecondaryKeywords(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="aud">Audiens</Label><Input id="aud" value={audience} onChange={(e) => setAudience(e.target.value)} /></div>
                  <div><Label htmlFor="int">Intent</Label><Input id="int" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="informational" /></div>
                  <div><Label htmlFor="goal">Tujuan halaman</Label><Input id="goal" value={pageGoal} onChange={(e) => setPageGoal(e.target.value)} /></div>
                  <div><Label htmlFor="ctype">Tipe konten</Label><Select id="ctype" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                    <option value="">pilih…</option><option>article</option><option>landing page</option><option>comparison</option><option>listicle</option><option>guide/tutorial</option>
                  </Select></div>
                </div>
                <div><Label htmlFor="biz">Info bisnis (fakta yang boleh dipakai, opsional)</Label><Textarea id="biz" rows={3} value={businessInfo} onChange={(e) => setBusinessInfo(e.target.value)} maxLength={4000} /></div>
                <Button type="submit" loading={busy} disabled={!projectId}>Buat brief (1 request AI)</Button>
              </form>
            </CardBody>
          </Card>
          {brief && (
            <Card>
              <CardBody>
                <h2 className="mb-2 text-sm font-semibold text-slate-800">Hasil brief — {brief.suggestedH1}</h2>
                <p className="text-sm text-slate-600"><b>Tujuan:</b> {brief.objective} · <b>Intent:</b> {brief.searchIntent}</p>
                <p className="mt-1 text-sm text-slate-600"><b>Audiens:</b> {brief.audienceProfile}</p>
                <ol className="mt-3 space-y-2">
                  {brief.outline.map((o, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium text-slate-700">{"H" + o.level} · {o.heading}</span>
                      <ul className="ml-4 list-disc text-xs text-slate-500">{o.points.map((p) => <li key={p}>{p}</li>)}</ul>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                  <div><p className="font-semibold">Fakta yang harus diverifikasi:</p><ul className="list-disc pl-4">{brief.factsToVerify.map((f) => <li key={f}>{f}</li>)}</ul></div>
                  <div><p className="font-semibold">Ide internal link:</p><ul className="list-disc pl-4">{brief.internalLinkIdeas.map((f) => <li key={f}>{f}</li>)}</ul></div>
                </div>
                <p className="mt-3 text-sm text-slate-600"><b>CTA:</b> {brief.ctaSuggestion}</p>
                <div className="mt-3"><Button variant="secondary" onClick={() => setTab("article")}>Lanjut ke draf artikel →</Button></div>
              </CardBody>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardBody className="space-y-3">
              <div className="max-w-48">
                <Label htmlFor="tw">Target jumlah kata</Label>
                <Select id="tw" value={targetWords} onChange={(e) => setTargetWords(Number(e.target.value))}>
                  {[400, 600, 800, 1200, 1500, 2000, 3000].map((n) => <option key={n} value={n}>{n} kata</option>)}
                </Select>
              </div>
              <Button loading={busy} onClick={() => makeArticle(false)}>Generate draf (1 request AI)</Button>
              <p className="text-xs text-slate-500">Setiap generate memakai 1 request Gemini global — hemat kuota dengan meregenerasi hanya bagian yang perlu.</p>
              {article && (
                <div className="border-t border-slate-200 pt-3">
                  <Label htmlFor="rh">Regenerate satu heading (opsional)</Label>
                  <div className="flex gap-2">
                    <Select id="rh" value={regenHeading} onChange={(e) => setRegenHeading(e.target.value)}>
                      <option value="">pilih bagian…</option>
                      {article.sections.map((s) => <option key={s.heading} value={s.heading}>{s.heading}</option>)}
                    </Select>
                    <Button variant="secondary" loading={busy} disabled={!regenHeading} onClick={() => makeArticle(true)}>Regenerate</Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
          {article ? (
            <Card>
              <CardBody>
                <h2 className="text-sm font-semibold text-slate-800">{article.title}</h2>
                <p className="mt-1 text-xs text-slate-500">Meta title ({[...article.metaTitle].length} kar.): {article.metaTitle}<br />Meta desc ({[...article.metaDescription].length} kar.): {article.metaDescription}</p>
                <div className="mt-3 max-h-[500px] space-y-3 overflow-y-auto">
                  {article.sections.map((s, i) => (
                    <div key={i}>
                      <h3 className="text-sm font-semibold text-slate-700">{s.heading}</h3>
                      <p className="whitespace-pre-wrap text-sm text-slate-600">{s.markdown}</p>
                    </div>
                  ))}
                  {article.faq.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">FAQ</h3>
                      {article.faq.map((f, i) => <p key={i} className="text-sm text-slate-600"><b>{f.question}</b><br />{f.answer}</p>)}
                    </div>
                  )}
                  <div><h3 className="text-sm font-semibold text-slate-700">Kesimpulan</h3><p className="whitespace-pre-wrap text-sm text-slate-600">{article.conclusion}</p></div>
                </div>
                {article.claimsToVerify.length > 0 && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <p className="font-semibold">Wajib diverifikasi sebelum tayang:</p>
                    <ul className="list-disc pl-4">{article.claimsToVerify.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => navigator.clipboard.writeText(toMarkdown(article)).then(() => setNotice("Markdown disalin ke clipboard."))}>
                    Salin Markdown
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <p className="text-sm text-slate-500">Belum ada draf. Buat brief dulu, lalu generate.</p>
          )}
        </div>
      )}
    </>
  );
}
