"use client";

import { FormEvent, useState, useRef, useEffect } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { MermaidRenderer } from "@/components/MermaidRenderer";

type DomainDesign = {
  module: string;
  design: {
    er_diagram_mermaid?: string;
    sql_ddl?: string;
    api_endpoints?: string[];
  };
  error?: string;
};

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
  documentText?: string;
  modules?: string[];
  domainDesigns?: DomainDesign[];
};

type ErrorResponse = {
  error?: string;
};

const templates = [
  {
    title: "SaaS Marketplace",
    icon: "🛒",
    description: "Multi-vendor catalogs, search, order placements, checkout, and admin approval workflows.",
    requirements: "A marketplace where vendors can list products, buyers can search and place orders, and admins can approve listings. It should track product inventory, support shopping carts, checkout processes, and generate invoices."
  },
  {
    title: "Support Ticketing",
    icon: "🎟️",
    description: "Automatic queue routing, ticket category matching, SLA deadline tracking, and alert triggers.",
    requirements: "An internal support portal that ingests tickets, routes them to teams based on categories, tracks SLAs with timers, sends status email/SMS notifications, and provides dashboards for analytics."
  },
  {
    title: "Learning Platform (LMS)",
    icon: "🎓",
    description: "Course enrollment logs, student progress dashboards, quiz modules, and certification steps.",
    requirements: "A learning platform with course catalogs, student enrollment, lessons progress tracking, quizzes, instructor grading dashboards, and certification generation upon course completion."
  }
];

const loadingSteps = [
  "Ingesting requirements & parsing document layout...",
  "Querying vector store & retrieving relevant context...",
  "Phase 1: Generating modular database schemas & API lists...",
  "Phase 2: Synthesizing global service topology & gateways...",
  "Assembling document sections & rendering diagrams..."
];

export default function Home() {
  const [requirements, setRequirements] = useState(templates[0].requirements);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<DesignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  
  // Dashboard Workspace State
  const [activeTab, setActiveTab] = useState<"architecture" | "database" | "requirements">("architecture");
  const [previewMode, setPreviewMode] = useState(true);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedReqs, setCopiedReqs] = useState(false);
  const [selectedModuleIndex, setSelectedModuleIndex] = useState<number>(0);

  // Advanced constraints states
  const [techStack, setTechStack] = useState("");
  const [designPrinciples, setDesignPrinciples] = useState("");
  const [securityProtocols, setSecurityProtocols] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // loading steps animation
  useEffect(() => {
    if (!isGenerating) {
      setActiveStep(0);
      return;
    }

    const timer1 = setTimeout(() => setActiveStep(1), 5000);
    const timer2 = setTimeout(() => setActiveStep(2), 11000);
    const timer3 = setTimeout(() => setActiveStep(3), 19000);
    const timer4 = setTimeout(() => setActiveStep(4), 26000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [isGenerating]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.set("requirements", requirements.trim());
      if (selectedFile) {
        formData.set("document", selectedFile);
      }
      formData.set("tech_stack", techStack.trim());
      formData.set("design_principles", designPrinciples.trim());
      formData.set("security_protocols", securityProtocols.trim());

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL !== undefined
        ? process.env.NEXT_PUBLIC_BACKEND_URL
        : "http://127.0.0.1:8080";
      const fetchUrl = backendUrl
        ? (backendUrl.startsWith("http") ? `${backendUrl}/api/design` : `${backendUrl}/design`)
        : "/api/design";

      const response = await fetch(fetchUrl, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as DesignResponse | ErrorResponse;

      if (!response.ok) {
        const errorPayload = payload as ErrorResponse;
        throw new Error(errorPayload.error ?? "Failed to generate a system design.");
      }

      setResult(payload as DesignResponse);
      setSelectedModuleIndex(0);
      setActiveTab("architecture"); // Reset to main tab
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

  function loadTemplate(sample: string) {
    setRequirements(sample);
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const resetWorkspace = () => {
    setResult(null);
  };

  const copyFullMarkdown = async () => {
    if (!result) return;
    const fullContent = `# System Architecture Report\nGenerated on ${new Date(result.generatedAt).toLocaleString()}\n\n## Project Summary\n${result.projectSummary}\n\n## Assumptions\n${result.assumptions.map(a => `- ${a}`).join('\n')}\n\n## Open Questions\n${result.openQuestions.map(q => `- ${q}`).join('\n')}\n\n${result.dataModelMarkdown}\n\n${result.systemDesignMarkdown}`;
    try {
      await navigator.clipboard.writeText(fullContent);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const fullContent = `# System Architecture Report\nGenerated on ${new Date(result.generatedAt).toLocaleString()}\n\n## Project Summary\n${result.projectSummary}\n\n## Assumptions\n${result.assumptions.map(a => `- ${a}`).join('\n')}\n\n## Open Questions\n${result.openQuestions.map(q => `- ${q}`).join('\n')}\n\n${result.dataModelMarkdown}\n\n${result.systemDesignMarkdown}`;
    const blob = new Blob([fullContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `archai_design_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen text-slate-100 bg-[#030712]">
      {/* Global Header Bar */}
      <header className="glass-panel border-b border-white/10 px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/10">
            <svg className="w-5 h-5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.656 48.656 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M3 12l-3 3m3-3l3 3" />
            </svg>
          </div>
          <span className="font-semibold text-lg tracking-tight text-white">Archai</span>
        </div>
        
        {result && (
          <div className="hidden md:flex items-center gap-6">
            <div className="text-xs text-slate-400 flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Size: <strong className="text-slate-200">{result.documentLength.toLocaleString()} chars</strong>
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                RAG Chunks: <strong className="text-slate-200">{result.selectedChunkCount}</strong>
              </span>
            </div>
          </div>
        )}

        {result ? (
          <div className="flex items-center gap-2">
            <button
              onClick={copyFullMarkdown}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 hover:text-white transition flex items-center gap-1.5 border border-white/5 cursor-pointer"
            >
              {copiedFull ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  <span className="text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  <span className="hidden sm:inline">Copy Report</span>
                </>
              )}
            </button>
            
            <button
              onClick={downloadReport}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 hover:text-white transition flex items-center gap-1.5 border border-white/5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span className="hidden sm:inline">Download MD</span>
            </button>

            <button
              onClick={resetWorkspace}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-xs font-semibold text-slate-950 transition flex items-center gap-1.5 shadow-md shadow-cyan-400/10 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              <span>New Design</span>
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500 font-mono">v1.2.0</span>
        )}
      </header>

      {/* Step-by-Step AI Progress Visualizer */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md px-4 py-8 animate-fade-in">
          <div className="max-w-md w-full glass-panel-glow p-8 rounded-3xl text-center flex flex-col items-center gap-6">
            {/* Animated glowing spinner */}
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-slate-850"></div>
              <div className="absolute inset-0 rounded-full border-4 border-t-cyan-400 border-r-cyan-400/40 animate-spin"></div>
              <div className="absolute inset-0 rounded-full bg-cyan-400/10 blur-xl"></div>
            </div>
            
            <div>
              <h2 className="text-xl font-semibold text-white tracking-tight text-gradient-cyan-indigo text-gradient-glow">Generating System Architecture</h2>
              <p className="text-xs text-slate-400 mt-1">This typically takes 20-30 seconds depending on LLM mapping</p>
            </div>

            <div className="w-full space-y-4 text-left border-t border-white/5 pt-6 mt-2">
              {loadingSteps.map((step, idx) => {
                const isDone = idx < activeStep;
                const isActive = idx === activeStep;
                return (
                  <div key={idx} className="flex items-start gap-3 text-xs leading-5">
                    {isDone ? (
                      <div className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-emerald-500/20 border border-emerald-500/80 flex items-center justify-center mt-0.5 animate-fade-in">
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : isActive ? (
                      <div className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-cyan-400/20 border border-cyan-400 flex items-center justify-center mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
                      </div>
                    ) : (
                      <div className="flex-shrink-0 w-4.5 h-4.5 rounded-full bg-slate-800/40 border border-slate-700 mt-0.5 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-650"></div>
                      </div>
                    )}
                    <span className={isDone ? "text-slate-400 line-through decoration-slate-600" : isActive ? "text-cyan-300 font-medium" : "text-slate-500"}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Dashboard (When result is ready) */}
      {result ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Sidebar Pane */}
          <aside className="glass-panel border-r border-white/10 p-5 flex flex-col gap-6 overflow-y-auto lg:h-[calc(100vh-69px)] lg:w-[320px] xl:w-[360px] flex-shrink-0">
            {/* Project Summary Block */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Project Summary</h3>
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 text-xs leading-6 text-slate-300 shadow-inner">
                {result.projectSummary}
              </div>
            </div>

            {/* Assumptions List */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Assumptions ({result.assumptions.length})</h3>
              <ul className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {result.assumptions.map((item, idx) => (
                  <li key={idx} className="bg-slate-900/30 border border-white/5 rounded-xl p-3 text-[11px] leading-4 text-slate-400 hover:text-slate-300 transition">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Open Questions List */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-violet-400 uppercase tracking-wider">Open Questions ({result.openQuestions.length})</h3>
              <ul className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {result.openQuestions.map((item, idx) => (
                  <li key={idx} className="bg-slate-900/30 border border-white/5 rounded-xl p-3 text-[11px] leading-4 text-slate-400 hover:text-slate-300 transition">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Retrieval Highlights Chunks */}
            <div className="space-y-2 flex-1 flex flex-col min-h-[180px]">
              <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">RAG Source Chunks ({result.selectedChunkCount})</h3>
              <ul className="space-y-2 overflow-y-auto pr-1 flex-1 max-h-[220px] lg:max-h-none">
                {result.retrievalHighlights.map((item, idx) => {
                  const match = item.match(/^(Chunk \d+(?:\s+\[[^\]]+\])?\s*\|\s*score\s*[\d\.]+):\s*(.*)$/);
                  const headerText = match ? match[1] : `Source Highlight ${idx + 1}`;
                  const contentText = match ? match[2] : item;
                  return (
                    <li key={idx} className="bg-slate-900/30 border border-white/5 rounded-xl p-3 text-[11px] hover:bg-slate-900/50 hover:border-emerald-500/20 transition group">
                      <div className="font-semibold text-slate-300 font-mono text-[10px] text-emerald-400/80 mb-1.5 flex items-center justify-between">
                        <span>{headerText}</span>
                        <svg className="w-3.5 h-3.5 text-slate-650 group-hover:text-emerald-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <p className="leading-4 text-slate-400 font-mono text-[10px] line-clamp-3 select-all">{contentText}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* Right Main Content Pane */}
          <main className="flex-1 flex flex-col overflow-hidden lg:h-[calc(100vh-69px)] bg-slate-950/20">
            {/* Toolbar Area */}
            <div className="bg-slate-900/40 border-b border-white/10 px-6 py-2.5 flex flex-col sm:flex-row gap-3 items-center justify-between select-none">
              {/* Tab options */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveTab("architecture")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                    activeTab === "architecture"
                      ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(34,211,238,0.05)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                  System Architecture
                </button>

                <button
                  onClick={() => setActiveTab("database")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                    activeTab === "database"
                      ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(34,211,238,0.05)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 5c0 2.21-3.58 4-8 4s-8-1.79-8-4" /></svg>
                  Database Schema
                </button>

                <button
                  onClick={() => setActiveTab("requirements")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
                    activeTab === "requirements"
                      ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(34,211,238,0.05)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Original Requirements
                </button>
              </div>

              {/* View options */}
              {activeTab !== "requirements" && (
                <div className="flex items-center gap-3 bg-slate-950/60 border border-white/5 px-2.5 py-1 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Format</span>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => setPreviewMode(true)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                        previewMode
                          ? "bg-cyan-400 text-slate-950"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setPreviewMode(false)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                        !previewMode
                          ? "bg-cyan-400 text-slate-950"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Source
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Viewport Render Area */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6">
              <div className={`${activeTab === "database" && result.domainDesigns && result.domainDesigns.length > 0 ? "max-w-6xl" : "max-w-4xl"} mx-auto w-full glass-panel p-6 md:p-8 rounded-2xl animate-slide-up bg-slate-950/40`}>
                {activeTab === "requirements" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <h2 className="text-base font-semibold text-white">Original Requirements Document</h2>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(result.documentText || requirements);
                          setCopiedReqs(true);
                          setTimeout(() => setCopiedReqs(false), 2000);
                        }}
                        className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 transition cursor-pointer flex items-center gap-1.5 font-semibold"
                      >
                        {copiedReqs ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            <span>Copy Requirements</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-xs text-slate-300 leading-6 whitespace-pre-wrap font-mono p-4 bg-slate-950 border border-white/5 rounded-xl max-h-[600px] overflow-y-auto">
                      {result.documentText || requirements}
                    </pre>
                  </div>
                ) : previewMode ? (
                  activeTab === "database" && result.domainDesigns && result.domainDesigns.length > 0 ? (
                    <div className="flex flex-col lg:flex-row gap-6 min-h-[500px]">
                      {/* Left module selector sidebar */}
                      <div className="w-full lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 pb-6 lg:pb-0 lg:pr-6 flex flex-col gap-2">
                        <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">Modules</h3>
                        <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-none max-h-[300px] lg:max-h-[500px] overflow-y-auto">
                          {result.domainDesigns.map((d, idx) => {
                            const isSelected = idx === selectedModuleIndex;
                            const tableCount = (d.design?.sql_ddl?.match(/CREATE TABLE/gi) || []).length;
                            const apiCount = d.design?.api_endpoints?.length || 0;
                            return (
                              <button
                                key={d.module}
                                type="button"
                                onClick={() => setSelectedModuleIndex(idx)}
                                className={`flex-shrink-0 lg:flex-shrink text-left px-3.5 py-2.5 rounded-xl transition duration-200 cursor-pointer flex items-center justify-between gap-3 border ${
                                  isSelected
                                    ? "bg-cyan-500/10 border-cyan-500/30 text-white font-medium"
                                    : "bg-slate-900/20 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                                }`}
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold truncate max-w-[120px] lg:max-w-[160px]">{d.module}</span>
                                  <span className="text-[10px] text-slate-500 mt-0.5">{tableCount} Tables • {apiCount} APIs</span>
                                </div>
                                <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isSelected ? "text-cyan-400 translate-x-0.5" : "text-slate-650"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right module detail display */}
                      <div className="flex-1 min-w-0 flex flex-col gap-6">
                        {(() => {
                          const activeDesign = result.domainDesigns[selectedModuleIndex];
                          if (!activeDesign) return null;
                          
                          return (
                            <>
                              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                <div>
                                  <h2 className="text-lg font-bold text-white leading-tight">{activeDesign.module}</h2>
                                  <p className="text-xs text-slate-500 mt-1">Database and API Specification</p>
                                </div>
                                
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const sql = activeDesign.design?.sql_ddl || "";
                                    const apis = (activeDesign.design?.api_endpoints || []).join("\n");
                                    await navigator.clipboard.writeText(`# ${activeDesign.module}\n\n## SQL DDL\n\`\`\`sql\n${sql}\n\`\`\`\n\n## API Endpoints\n${apis}`);
                                  }}
                                  className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/5 transition flex items-center gap-1.5 cursor-pointer font-semibold"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                  Copy Module Spec
                                </button>
                              </div>

                              <div className="space-y-6">
                                {/* ER Diagram Section */}
                                {activeDesign.design?.er_diagram_mermaid && (
                                  <div className="space-y-2.5">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entity Relationship Diagram</h4>
                                    <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-4 overflow-x-auto flex justify-center">
                                      <MermaidRenderer chart={activeDesign.design.er_diagram_mermaid} />
                                    </div>
                                  </div>
                                )}

                                {/* SQL DDL Code block */}
                                {activeDesign.design?.sql_ddl && (
                                  <div className="space-y-2.5">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">PostgreSQL DDL</h4>
                                    <pre className="text-xs text-slate-350 leading-5 whitespace-pre-wrap font-mono p-4 bg-slate-950/80 border border-white/5 rounded-2xl max-h-[350px] overflow-y-auto select-all">
                                      {activeDesign.design.sql_ddl}
                                    </pre>
                                  </div>
                                )}

                                {/* API Endpoints with badges */}
                                {activeDesign.design?.api_endpoints && activeDesign.design.api_endpoints.length > 0 && (
                                  <div className="space-y-2.5">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">API Endpoints ({activeDesign.design.api_endpoints.length})</h4>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {activeDesign.design.api_endpoints.map((endpoint, i) => {
                                        const match = endpoint.match(/^([A-Z]+)\s+(.+)$/);
                                        const method = match ? match[1] : "GET";
                                        const path = match ? match[2] : endpoint;
                                        
                                        let badgeColor = "bg-sky-500/10 text-sky-400 border-sky-500/20";
                                        if (method === "POST") badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                                        if (method === "PUT" || method === "PATCH") badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                                        if (method === "DELETE") badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                                        
                                        return (
                                          <div key={i} className="bg-slate-900/30 border border-white/5 rounded-xl p-3 flex items-center gap-3 font-mono text-[11px] hover:border-white/10 transition">
                                            <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${badgeColor}`}>{method}</span>
                                            <span className="text-slate-300 truncate select-all">{path}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <MarkdownRenderer
                      content={
                        activeTab === "architecture"
                          ? result.systemDesignMarkdown
                          : result.dataModelMarkdown
                      }
                    />
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <h2 className="text-base font-semibold text-white">
                        Raw {activeTab === "architecture" ? "Architecture" : "Schema"} Markdown Source
                      </h2>
                      <button
                        onClick={async () => {
                          const content = activeTab === "architecture" ? result.systemDesignMarkdown : result.dataModelMarkdown;
                          await navigator.clipboard.writeText(content);
                        }}
                        className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 transition cursor-pointer flex items-center gap-1.5"
                      >
                        Copy Raw Markdown
                      </button>
                    </div>
                    <pre className="text-xs text-slate-350 leading-5 whitespace-pre-wrap font-mono p-4 bg-slate-950 border border-white/5 rounded-xl max-h-[600px] overflow-y-auto">
                      {activeTab === "architecture"
                        ? result.systemDesignMarkdown
                        : result.dataModelMarkdown}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      ) : (
        /* Original Form/Landing Layout */
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12 animate-fade-in">
          <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            {/* Info Card Layout */}
            <div className="glass-panel p-6 sm:p-8 rounded-[32px] flex flex-col justify-between shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-400/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
              <div>
                <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  SRS to Architecture
                </div>
                <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
                  Turn product briefs into system architectures instantly.
                </h1>
                <p className="mt-4 text-sm leading-6 text-slate-400">
                  Paste requirements or upload an SRS/PRD. Archai splits the document, builds a semantic index, maps database entities, and synthesizes service diagrams using a Gemini-backed RAG pipeline.
                </p>

                {/* Features Highlights */}
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      title: "SRS Chunking",
                      desc: "Splits texts into semantic paragraphs, indexing modules automatically.",
                      icon: "🔍"
                    },
                    {
                      title: "Database Models",
                      desc: "Generates Entity-Relationship maps and PostgreSQL DDL sketches.",
                      icon: "🗄️"
                    },
                    {
                      title: "Architecture Design",
                      desc: "Renders service gateway routing charts and request sequences.",
                      icon: "🌐"
                    }
                  ].map((feat) => (
                    <div key={feat.title} className="bg-slate-900/30 border border-white/5 p-4 rounded-2xl flex flex-col gap-1.5 shadow-inner">
                      <div className="flex items-center gap-2">
                        <span className="text-md">{feat.icon}</span>
                        <span className="text-xs font-bold text-slate-200">{feat.title}</span>
                      </div>
                      <p className="text-[10px] leading-4 text-slate-500">{feat.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Template quick starts */}
              <div className="mt-8 border-t border-white/5 pt-6">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Templates</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {templates.map((tmpl) => (
                    <button
                      key={tmpl.title}
                      type="button"
                      onClick={() => loadTemplate(tmpl.requirements)}
                      className="text-left bg-slate-900/40 border border-white/5 p-3 rounded-xl hover:border-cyan-400/20 hover:bg-slate-900/60 active:scale-[0.98] transition-all duration-300 cursor-pointer flex flex-col gap-1.5 group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm group-hover:scale-110 transition duration-300">{tmpl.icon}</span>
                        <span className="text-[11px] font-bold text-slate-300 group-hover:text-cyan-300 transition duration-300">
                          {tmpl.title}
                        </span>
                      </div>
                      <p className="text-[9.5px] leading-3.5 text-slate-500 group-hover:text-slate-450 transition line-clamp-2">
                        {tmpl.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Input Form Panel */}
            <div className="glass-panel p-6 sm:p-8 rounded-[32px] flex flex-col justify-between shadow-2xl relative">
              <form className="space-y-6 flex-1 flex flex-col" onSubmit={handleSubmit}>
                {/* Drag and Drop File Upload Container */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    Upload SRS Document
                  </label>
                  
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-3 min-h-[140px] ${
                      selectedFile
                        ? "border-cyan-400/40 bg-cyan-400/5 shadow-inner"
                        : "border-white/10 bg-slate-950/40 hover:border-cyan-400/30 hover:bg-slate-950/60"
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".txt,.md,.pdf,.json,.csv"
                      className="hidden"
                    />
                    
                    {selectedFile ? (
                      <div className="flex flex-col items-center gap-2 w-full">
                        <div className="w-9 h-9 rounded-full bg-cyan-400/10 flex items-center justify-center border border-cyan-400/20">
                          <svg className="w-4.5 h-4.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-semibold text-slate-200 truncate max-w-[200px] mx-auto">
                            {selectedFile.name}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearFile();
                          }}
                          className="mt-1.5 text-[10px] font-semibold text-rose-450 hover:text-rose-400 hover:underline px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 transition cursor-pointer"
                        >
                          Remove File
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                          <svg className="w-4.5 h-4.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-slate-200">
                            Drag & drop file here, or click to browse
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-1">
                            Supports PDF, MD, TXT, CSV, or JSON (max 10MB)
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Requirements Description Area */}
                <div className="space-y-2 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider" htmlFor="requirements">
                      Requirements Details
                    </label>
                    {requirements.trim() && (
                      <button
                        type="button"
                        onClick={() => setRequirements("")}
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-300 hover:underline cursor-pointer"
                      >
                        Clear Text
                      </button>
                    )}
                  </div>
                  <textarea
                    id="requirements"
                    name="requirements"
                    value={requirements}
                    onChange={(event) => setRequirements(event.target.value)}
                    placeholder="Provide additional architectural notes, user narratives, or paste your requirements outline..."
                    className="flex-1 min-h-[220px] w-full rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs leading-6 text-slate-100 outline-none transition-all duration-300 placeholder:text-slate-650 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
                  />
                </div>

                {/* Collapsible Advanced Configuration Section */}
                <div className="border border-white/5 bg-slate-900/10 rounded-2xl overflow-hidden transition-all duration-300">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center justify-between w-full px-4 py-3 text-xs font-semibold text-slate-350 hover:text-white bg-slate-900/20 hover:bg-slate-900/40 transition cursor-pointer select-none"
                  >
                    <span className="flex items-center gap-2">
                      <span>⚙️</span>
                      <span>Advanced Configuration (Optional)</span>
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-300 ${
                        showAdvanced ? "transform rotate-180 text-cyan-400" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showAdvanced && (
                    <div className="p-4 space-y-4 border-t border-white/5 bg-slate-950/20 animate-fade-in">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                          Target Tech Stack
                        </label>
                        <textarea
                          placeholder="e.g., PostgreSQL, FastAPI, Redis, React"
                          value={techStack}
                          onChange={(e) => setTechStack(e.target.value)}
                          rows={2}
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-650 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                          Design Principles
                        </label>
                        <textarea
                          placeholder="e.g., Microservices, Event Sourcing, CQRS, DDD"
                          value={designPrinciples}
                          onChange={(e) => setDesignPrinciples(e.target.value)}
                          rows={2}
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-650 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
                          Security Protocols
                        </label>
                        <textarea
                          placeholder="e.g., Role-Based Access Control, AES-256 field encryption"
                          value={securityProtocols}
                          onChange={(e) => setSecurityProtocols(e.target.value)}
                          rows={2}
                          className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-650 focus:border-cyan-450/40 focus:ring-1 focus:ring-cyan-450/20"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submission Error Banner */}
                {error && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-350 animate-fade-in flex items-center gap-2">
                    <svg className="w-4.5 h-4.5 text-rose-450 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Trigger Button */}
                <button
                  type="submit"
                  disabled={isGenerating || (!requirements.trim() && !selectedFile)}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 py-3.5 text-xs font-bold text-slate-950 transition-all duration-300 hover:bg-cyan-300 hover:shadow-lg hover:shadow-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-400 disabled:hover:shadow-none cursor-pointer"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Generate System Design
                </button>
              </form>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
