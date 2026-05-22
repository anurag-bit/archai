"use client";

import { FormEvent, useState } from "react";

type DesignResponse = {
  projectSummary: string;
  assumptions: string[];
  openQuestions: string[];
  retrievalHighlights: string[];
  dataModelMarkdown: string;
  systemDesignMarkdown: string;
  selectedChunkCount: number;
  documentLength: number;
  generatedAt: string;
};

type ErrorResponse = {
  error?: string;
};

const sampleRequirements = [
  "A marketplace where vendors can list products, buyers can search and place orders, and admins can approve listings.",
  "An internal support portal that ingests tickets, routes them to teams, tracks SLAs, and sends status notifications.",
  "A learning platform with course catalogs, enrollment, progress tracking, quizzes, and instructor dashboards.",
];

export default function Home() {
  const [requirements, setRequirements] = useState(sampleRequirements[0]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<DesignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsGenerating(true);

    try {
      const formElement = event.currentTarget;
      const formData = new FormData(formElement);
      formData.set("requirements", requirements.trim());

      const response = await fetch("/api/design", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as DesignResponse | ErrorResponse;

      if (!response.ok) {
        throw new Error((payload as ErrorResponse).error ?? "Failed to generate a system design.");
      }

      setResult(payload as DesignResponse);
    } catch (submissionError) {
      setResult(null);
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to generate a system design."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function loadSample(sample: string) {
    setRequirements(sample);
    setFileName(null);
    setError(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[32px] border border-white/10 bg-slate-950/55 p-6 shadow-[0_30px_120px_rgba(2,8,23,0.55)] backdrop-blur-xl sm:p-8">
          <div className="inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.32em] text-cyan-100">
            SRS to system design
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Turn a requirements document into an architecture draft with a Gemini-backed RAG pipeline.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
            Paste an SRS, PRD, or feature brief and get a structured design package:
            product summary, data model, system design, and the retrieval chunks that informed the result.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Requirements parsing", "Break the document into ranked chunks before generation."],
              ["Database design", "Extract entities, relationships, and constraints."],
              ["Architecture output", "Produce a Markdown design with Mermaid diagrams."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">{description}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-cyan-300/15 bg-cyan-300/5 p-4 sm:p-5">
            <div className="text-sm font-semibold text-cyan-100">Example inputs</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sampleRequirements.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => loadSample(sample)}
                  className="rounded-full border border-white/10 bg-slate-900/80 px-4 py-2 text-left text-sm text-slate-200 transition hover:border-cyan-300/40 hover:bg-slate-900"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[var(--card)] p-6 shadow-[0_30px_120px_rgba(2,8,23,0.45)] backdrop-blur-xl sm:p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-medium text-slate-200" htmlFor="document">
                Upload document
              </label>
              <input
                className="mt-2 block w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
                id="document"
                name="document"
                type="file"
                accept=".txt,.md,.pdf,.json,.csv"
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
              />
              <p className="mt-2 text-xs text-slate-400">
                {fileName ? `Selected file: ${fileName}` : "PDF, text, Markdown, or CSV is fine."}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-200" htmlFor="requirements">
                Requirements text
              </label>
              <textarea
                className="mt-2 min-h-[220px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20"
                id="requirements"
                name="requirements"
                value={requirements}
                onChange={(event) => setRequirements(event.target.value)}
                placeholder="Paste an SRS, PRD, feature brief, or functional requirements here."
              />
            </div>

            {error ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <button
              className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isGenerating}
            >
              {isGenerating ? "Generating design..." : "Generate system design"}
            </button>
          </form>
        </div>
      </section>

      {result ? (
        <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-6">
            <article className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">
                Summary
              </div>
              <p className="mt-4 text-base leading-7 text-slate-200">{result.projectSummary}</p>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-400">Document size</dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {result.documentLength.toLocaleString()} characters
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-400">Retrieved chunks</dt>
                  <dd className="mt-2 text-lg font-semibold text-white">
                    {result.selectedChunkCount}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Assumptions</div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                {result.assumptions.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Open questions</div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                {result.openQuestions.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">
                Retrieval highlights
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                {result.retrievalHighlights.map((item) => (
                  <li key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <div className="space-y-6">
            <article className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Data model</div>
                  <h2 className="mt-2 text-xl font-semibold text-white">Schema draft</h2>
                </div>
                <div className="text-xs text-slate-400">Generated {new Date(result.generatedAt).toLocaleString()}</div>
              </div>
              <pre className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950 p-5 text-sm leading-6 text-slate-200 whitespace-pre-wrap">
                {result.dataModelMarkdown}
              </pre>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
              <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">
                System design
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white">Architecture draft</h2>
              <pre className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950 p-5 text-sm leading-6 text-slate-200 whitespace-pre-wrap">
                {result.systemDesignMarkdown}
              </pre>
            </article>
          </div>
        </section>
      ) : null}
    </main>
  );
}
