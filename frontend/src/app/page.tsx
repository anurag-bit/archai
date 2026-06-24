"use client";

import { FormEvent, useState, useRef, useEffect } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { Header } from "@/components/Header";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { ProjectSummary } from "@/components/ProjectSummary";
import { Assumptions } from "@/components/Assumptions";
import { OpenQuestions } from "@/components/OpenQuestions";
import { SourceChunks } from "@/components/SourceChunks";
import { TemplateQuickStarts } from "@/components/TemplateQuickStarts";
import { DocumentUpload } from "@/components/DocumentUpload";
import { AdvancedConfig } from "@/components/AdvancedConfig";
import { WorkspaceTabs } from "@/components/WorkspaceTabs";
import { ModuleSelector } from "@/components/ModuleSelector";
import { ModuleSpec } from "@/components/ModuleSpec";

type DomainDesign = {
  module: string;
  design: {
    er_diagram_mermaid?: string;
    sql_ddl?: string;
    api_endpoints?: string[];
    dfd_mermaid?: string;
    component_mermaid?: string;
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
  terraformCode?: string;
  openapiSpec?: string;
  documentId?: string;
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

export default function Home() {
  const [requirements, setRequirements] = useState(templates[0].requirements);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<DesignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  
  // Dashboard Workspace State
  const [activeTab, setActiveTab] = useState<"architecture" | "database" | "requirements" | "terraform" | "openapi">("architecture");
  const [previewMode, setPreviewMode] = useState(true);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedReqs, setCopiedReqs] = useState(false);
  const [copiedTerraform, setCopiedTerraform] = useState(false);
  const [copiedOpenApi, setCopiedOpenApi] = useState(false);
  const [selectedModuleIndex, setSelectedModuleIndex] = useState<number>(0);
  const [isRegeneratingModule, setIsRegeneratingModule] = useState(false);
  const [isPatchingSchema, setIsPatchingSchema] = useState(false);
  const [isResumingDesign, setIsResumingDesign] = useState(false);

  // Advanced constraints states
  const [techStack, setTechStack] = useState("");
  const [designPrinciples, setDesignPrinciples] = useState("");
  const [securityProtocols, setSecurityProtocols] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Open questions answers state
  const [answers, setAnswers] = useState<Record<number, string>>({});

  // Loading steps animation
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

  async function handleSubmit(event?: FormEvent<HTMLFormElement> | null, customAnswers?: Record<number, string>) {
    if (event) event.preventDefault();
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

      const activeAnswers = customAnswers ?? answers;
      const answersText = result ? result.openQuestions.map((q, idx) => {
        const ans = activeAnswers[idx];
        if (!ans) return "";
        return `Question: ${q}\nAnswer: ${ans}`;
      }).filter(Boolean).join("\n\n") : "";
      formData.set("open_questions_answers", answersText);

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

  const loadTemplate = (sample: string) => {
    setRequirements(sample);
    setSelectedFile(null);
    setError(null);
  };

  const handleFileDrop = (e: React.DragEvent) => {
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
  };

  const resetWorkspace = () => {
    setResult(null);
    setAnswers({});
  };

  const handleRegenerateModule = async (moduleName: string) => {
    if (!result || !result.documentId) return;
    setIsRegeneratingModule(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL !== undefined
        ? process.env.NEXT_PUBLIC_BACKEND_URL
        : "http://127.0.0.1:8080";
      const fetchUrl = `${backendUrl}/api/design/${result.documentId}/regenerate/${encodeURIComponent(moduleName)}`;
      
      const response = await fetch(fetchUrl, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to regenerate module design.");
      }

      const payload = (await response.json()) as DesignResponse;
      setResult(payload);
    } catch (err: any) {
      setError(err.message || "Failed to regenerate module design.");
    } finally {
      setIsRegeneratingModule(false);
    }
  };

  const handlePatchSchema = async (moduleName: string, newTables: any[]) => {
    if (!result || !result.documentId) return;
    setIsPatchingSchema(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL !== undefined
        ? process.env.NEXT_PUBLIC_BACKEND_URL
        : "http://127.0.0.1:8080";
      const fetchUrl = `${backendUrl}/api/design/${result.documentId}/patch/${encodeURIComponent(moduleName)}`;
      
      const response = await fetch(fetchUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tables: newTables }),
      });

      if (!response.ok) {
        throw new Error("Failed to save schema patch.");
      }

      const payload = (await response.json()) as DesignResponse;
      setResult(payload);
    } catch (err: any) {
      setError(err.message || "Failed to save schema patch.");
    } finally {
      setIsPatchingSchema(false);
    }
  };

  const handleResumeDesign = async (moduleName: string, instruction: string) => {
    if (!result || !result.documentId) return;
    setIsResumingDesign(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL !== undefined
        ? process.env.NEXT_PUBLIC_BACKEND_URL
        : "http://127.0.0.1:8080";
      const fetchUrl = `${backendUrl}/api/design/${result.documentId}/resume`;
      
      const response = await fetch(fetchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          module_name: moduleName,
          instruction: instruction,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to resume design execution.");
      }

      const payload = (await response.json()) as DesignResponse;
      setResult(payload);
    } catch (err: any) {
      setError(err.message || "Failed to resume design execution.");
    } finally {
      setIsResumingDesign(false);
    }
  };

  const copyFullMarkdown = async () => {
    if (!result) return;
    const tfBlock = result.terraformCode ? `\n\n# Terraform IaC Configuration\n\n\`\`\`terraform\n${result.terraformCode}\n\`\`\`` : "";
    const apiBlock = result.openapiSpec ? `\n\n# OpenAPI 3.0 Specification\n\n\`\`\`yaml\n${result.openapiSpec}\n\`\`\`` : "";
    const fullContent = `# System Architecture Report\nGenerated on ${new Date(result.generatedAt).toLocaleString()}\n\n## Project Summary\n${result.projectSummary}\n\n## Assumptions\n${result.assumptions.map(a => `- ${a}`).join('\n')}\n\n## Open Questions\n${result.openQuestions.map(q => `- ${q}`).join('\n')}\n\n${result.dataModelMarkdown}\n\n${result.systemDesignMarkdown}${tfBlock}${apiBlock}`;
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
    const tfBlock = result.terraformCode ? `\n\n# Terraform IaC Configuration\n\n\`\`\`terraform\n${result.terraformCode}\n\`\`\`` : "";
    const apiBlock = result.openapiSpec ? `\n\n# OpenAPI 3.0 Specification\n\n\`\`\`yaml\n${result.openapiSpec}\n\`\`\`` : "";
    const fullContent = `# System Architecture Report\nGenerated on ${new Date(result.generatedAt).toLocaleString()}\n\n## Project Summary\n${result.projectSummary}\n\n## Assumptions\n${result.assumptions.map(a => `- ${a}`).join('\n')}\n\n## Open Questions\n${result.openQuestions.map(q => `- ${q}`).join('\n')}\n\n${result.dataModelMarkdown}\n\n${result.systemDesignMarkdown}${tfBlock}${apiBlock}`;
    const blob = new Blob([fullContent], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `archai_design_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyRequirementsText = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.documentText || requirements);
      setCopiedReqs(true);
      setTimeout(() => setCopiedReqs(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const copyRawMarkdownText = async () => {
    if (!result) return;
    const content = activeTab === "architecture" ? result.systemDesignMarkdown : result.dataModelMarkdown;
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col min-h-screen text-slate-100 bg-[#030712]">
      <Header
        result={result}
        copiedFull={copiedFull}
        onCopyFull={copyFullMarkdown}
        onDownload={downloadReport}
        onReset={resetWorkspace}
      />
      
      <LoadingOverlay isGenerating={isGenerating} activeStep={activeStep} />

      {result ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Sidebar Pane */}
          <aside className="glass-panel border-r border-white/10 p-5 flex flex-col gap-6 overflow-y-auto lg:h-[calc(100vh-69px)] lg:w-[320px] xl:w-[360px] flex-shrink-0">
            <ProjectSummary summary={result.projectSummary} />
            <Assumptions assumptions={result.assumptions} />
            
            <OpenQuestions
              questions={result.openQuestions}
              answers={answers}
              isGenerating={isGenerating}
              onAnswerChange={(idx, val) => setAnswers(prev => ({ ...prev, [idx]: val }))}
              onClearAnswers={() => setAnswers({})}
              onSubmitAnswers={() => handleSubmit(null)}
            />

            <SourceChunks chunkCount={result.selectedChunkCount} highlights={result.retrievalHighlights} />
          </aside>

          {/* Right Main Content Pane */}
          <main className="flex-1 flex flex-col overflow-hidden lg:h-[calc(100vh-69px)] bg-slate-950/20">
            <WorkspaceTabs
              activeTab={activeTab}
              previewMode={previewMode}
              onTabChange={setActiveTab}
              onPreviewModeChange={setPreviewMode}
            />

            {/* Viewport Render Area */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6">
              <div className={`${activeTab === "database" && result.domainDesigns && result.domainDesigns.length > 0 ? "max-w-6xl" : "max-w-4xl"} mx-auto w-full glass-panel p-6 md:p-8 rounded-2xl animate-slide-up bg-slate-950/40`}>
                {activeTab === "requirements" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <h2 className="text-base font-semibold text-white">Original Requirements Document</h2>
                      <button
                        onClick={copyRequirementsText}
                        className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 transition cursor-pointer flex items-center gap-1.5 font-semibold"
                      >
                        {copiedReqs ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            <span>Copy Requirements</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-xs text-slate-300 leading-6 whitespace-pre-wrap font-mono p-4 bg-slate-950 border border-white/5 rounded-xl max-h-[600px] overflow-y-auto">
                      {result.documentText || requirements}
                    </pre>
                  </div>
                ) : activeTab === "openapi" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div>
                        <h2 className="text-base font-semibold text-white">OpenAPI Specification (openapi.yaml)</h2>
                        <p className="text-xs text-slate-500 mt-1">Cohesive REST API specification generated from all module designs</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (result.openapiSpec) {
                            try {
                              await navigator.clipboard.writeText(result.openapiSpec);
                              setCopiedOpenApi(true);
                              setTimeout(() => setCopiedOpenApi(false), 2000);
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 transition cursor-pointer flex items-center gap-1.5 font-semibold"
                      >
                        {copiedOpenApi ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            <span>Copy openapi.yaml</span>
                          </>
                        )}
                      </button>
                    </div>
                    <MarkdownRenderer content={`\`\`\`yaml\n${result.openapiSpec || "# No OpenAPI specification generated."}\n\`\`\``} />
                  </div>
                ) : activeTab === "terraform" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div>
                        <h2 className="text-base font-semibold text-white">Terraform Infrastructure as Code (main.tf)</h2>
                        <p className="text-xs text-slate-500 mt-1">AWS Provider modules based on architecture specification</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (result.terraformCode) {
                            try {
                              await navigator.clipboard.writeText(result.terraformCode);
                              setCopiedTerraform(true);
                              setTimeout(() => setCopiedTerraform(false), 2000);
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 transition cursor-pointer flex items-center gap-1.5 font-semibold"
                      >
                        {copiedTerraform ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            <span>Copy main.tf</span>
                          </>
                        )}
                      </button>
                    </div>
                    <MarkdownRenderer content={`\`\`\`terraform\n${result.terraformCode || "# No terraform code generated."}\n\`\`\``} />
                  </div>
                ) : previewMode ? (
                  activeTab === "database" && result.domainDesigns && result.domainDesigns.length > 0 ? (() => {
                    const allModulesDisplay = result.modules?.map(name => {
                      const completedDesign = result.domainDesigns?.find(d => d.module === name);
                      if (completedDesign) {
                        return {
                          module: name,
                          status: "completed" as const,
                          design: completedDesign.design,
                        };
                      }
                      const interruptedDetail = (result as any).interruptedModuleDetails?.[name];
                      return {
                        module: name,
                        status: "interrupted" as const,
                        design: {
                          sql_ddl: interruptedDetail?.dba_draft ? "-- Partial schema design generated before interruption" : undefined,
                          raw_json: interruptedDetail?.dba_draft ? { data_model: { tables: interruptedDetail.dba_draft.data_model?.tables || [] } } : undefined,
                        },
                        error: interruptedDetail?.qa_feedback,
                      };
                    }) || [];
                    return (
                      <div className="flex flex-col lg:flex-row gap-6 min-h-[500px]">
                        <ModuleSelector
                          domainDesigns={allModulesDisplay}
                          selectedModuleIndex={selectedModuleIndex}
                          onSelectModule={setSelectedModuleIndex}
                        />
                        {allModulesDisplay[selectedModuleIndex] && (
                          <ModuleSpec
                            activeDesign={allModulesDisplay[selectedModuleIndex]}
                            documentId={result.documentId}
                            isRegenerating={isRegeneratingModule}
                            onRegenerateModule={handleRegenerateModule}
                            onPatchSchema={handlePatchSchema}
                            isPatching={isPatchingSchema}
                            onResumeDesign={handleResumeDesign}
                            isResuming={isResumingDesign}
                          />
                        )}
                      </div>
                    );
                  })() : (
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
                        onClick={copyRawMarkdownText}
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

              <TemplateQuickStarts templates={templates} onLoadTemplate={loadTemplate} />
            </div>

            {/* Input Form Panel */}
            <div className="glass-panel p-6 sm:p-8 rounded-[32px] flex flex-col justify-between shadow-2xl relative">
              <form className="space-y-6 flex-1 flex flex-col" onSubmit={handleSubmit}>
                <DocumentUpload
                  selectedFile={selectedFile}
                  onFileDrop={handleFileDrop}
                  onFileChange={handleFileChange}
                  onClearFile={clearFile}
                />

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
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-350 hover:underline cursor-pointer"
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

                <AdvancedConfig
                  showAdvanced={showAdvanced}
                  techStack={techStack}
                  designPrinciples={designPrinciples}
                  securityProtocols={securityProtocols}
                  onShowAdvancedChange={setShowAdvanced}
                  onTechStackChange={setTechStack}
                  onDesignPrinciplesChange={setDesignPrinciples}
                  onSecurityProtocolsChange={setSecurityProtocols}
                />

                {/* Submission Error Banner */}
                {error && (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-350 animate-fade-in flex items-center gap-2">
                    <svg className="w-4.5 h-4.5 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
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
