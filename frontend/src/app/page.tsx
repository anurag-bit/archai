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
    frontend_design?: {
      component_tree_mermaid: string;
      state_management: any;
      routing_structure: any;
      wireframe_descriptions: Array<{
        view_name: string;
        layout_description: string;
      }>;
    };
    test_strategy?: {
      bdd_scenarios?: any;
      test_pyramid?: any;
      load_testing?: any;
    };
    raw_json?: any;
  };
  error?: string;
};

type ProjectPlan = {
  effort_estimation: string;
  sprint_breakdown: string;
  dependency_graph: string;
  risk_register: string;
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
  devopsArtifacts?: {
    dockerfile?: string;
    docker_compose?: string;
    ci_cd_pipeline?: string;
    k8s_config?: string;
  };
  projectPlan?: ProjectPlan;
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

  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(savedTheme);
    } else {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(nextTheme);
    window.dispatchEvent(new Event("theme-change"));
  };
  
  // Dashboard Workspace State
  const [activeTab, setActiveTab] = useState<"architecture" | "database" | "frontend" | "testing" | "requirements" | "terraform" | "openapi" | "devops" | "roadmap">("architecture");
  const [previewMode, setPreviewMode] = useState(true);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedReqs, setCopiedReqs] = useState(false);
  const [copiedTerraform, setCopiedTerraform] = useState(false);
  const [copiedOpenApi, setCopiedOpenApi] = useState(false);
  const [copiedDockerfile, setCopiedDockerfile] = useState(false);
  const [copiedCompose, setCopiedCompose] = useState(false);
  const [copiedCiCd, setCopiedCiCd] = useState(false);
  const [copiedK8s, setCopiedK8s] = useState(false);
  const [copiedRoadmapPart, setCopiedRoadmapPart] = useState(false);
  const [activeDevopsSubTab, setActiveDevopsSubTab] = useState<"dockerfile" | "compose" | "cicd" | "k8s">("dockerfile");
  const [activeRoadmapSubTab, setActiveRoadmapSubTab] = useState<"sprints" | "estimates" | "dependencies" | "risks">("sprints");
  const [selectedModuleIndex, setSelectedModuleIndex] = useState<number>(0);
  const [isRegeneratingModule, setIsRegeneratingModule] = useState(false);
  const [isPatchingSchema, setIsPatchingSchema] = useState(false);
  const [isResumingDesign, setIsResumingDesign] = useState(false);

  // Advanced constraints states
  const [techStack, setTechStack] = useState("");
  const [designPrinciples, setDesignPrinciples] = useState("");
  const [securityProtocols, setSecurityProtocols] = useState("");
  const [cloudProvider, setCloudProvider] = useState("aws");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Chat refinement state
  const [refineInput, setRefineInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);

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
      formData.set("cloud_provider", cloudProvider.trim());

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

  const handleRefineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result || !result.documentId || !refineInput.trim()) return;

    setIsRefining(true);
    setError(null);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL !== undefined
        ? process.env.NEXT_PUBLIC_BACKEND_URL
        : "http://127.0.0.1:8080";
      const fetchUrl = `${backendUrl}/api/design/${result.documentId}/refine`;

      const response = await fetch(fetchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: refineInput.trim(),
        }),
      });

      if (!response.ok) {
        const errPayload = await response.json();
        throw new Error(errPayload.detail || "Failed to refine the design.");
      }

      const payload = (await response.json()) as DesignResponse;
      setResult(payload);
      setRefineInput("");
    } catch (err: any) {
      setError(err.message || "Failed to refine design.");
    } finally {
      setIsRefining(false);
    }
  };

  const copyFullMarkdown = async () => {
    if (!result) return;
    const tfBlock = result.terraformCode ? `\n\n# Terraform IaC Configuration\n\n\`\`\`terraform\n${result.terraformCode}\n\`\`\`` : "";
    const apiBlock = result.openapiSpec ? `\n\n# OpenAPI 3.0 Specification\n\n\`\`\`yaml\n${result.openapiSpec}\n\`\`\`` : "";
    const devopsBlock = result.devopsArtifacts
      ? `\n\n# DevOps & Deployment Configurations\n\n## Dockerfile\n\`\`\`dockerfile\n${result.devopsArtifacts.dockerfile || ""}\n\`\`\`\n\n## docker-compose.yml\n\`\`\`yaml\n${result.devopsArtifacts.docker_compose || ""}\n\`\`\`\n\n## CI/CD Pipeline\n\`\`\`yaml\n${result.devopsArtifacts.ci_cd_pipeline || ""}\n\`\`\`\n\n## Kubernetes Config\n\`\`\`yaml\n${result.devopsArtifacts.k8s_config || ""}\n\`\`\``
      : "";
    const pmBlock = result.projectPlan
      ? `\n\n# Project Roadmap & Plan\n\n## Effort Estimation\n${result.projectPlan.effort_estimation}\n\n## Sprint Breakdown\n${result.projectPlan.sprint_breakdown}\n\n## Dependency Graph\n\`\`\`mermaid\n${result.projectPlan.dependency_graph}\n\`\`\`\n\n## Risk Register\n${result.projectPlan.risk_register}`
      : "";
    const fullContent = `# System Architecture Report\nGenerated on ${new Date(result.generatedAt).toLocaleString()}\n\n## Project Summary\n${result.projectSummary}\n\n## Assumptions\n${result.assumptions.map(a => `- ${a}`).join('\n')}\n\n## Open Questions\n${result.openQuestions.map(q => `- ${q}`).join('\n')}\n\n${result.dataModelMarkdown}\n\n${result.systemDesignMarkdown}${tfBlock}${apiBlock}${devopsBlock}${pmBlock}`;
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
    const devopsBlock = result.devopsArtifacts
      ? `\n\n# DevOps & Deployment Configurations\n\n## Dockerfile\n\`\`\`dockerfile\n${result.devopsArtifacts.dockerfile || ""}\n\`\`\`\n\n## docker-compose.yml\n\`\`\`yaml\n${result.devopsArtifacts.docker_compose || ""}\n\`\`\`\n\n## CI/CD Pipeline\n\`\`\`yaml\n${result.devopsArtifacts.ci_cd_pipeline || ""}\n\`\`\`\n\n## Kubernetes Config\n\`\`\`yaml\n${result.devopsArtifacts.k8s_config || ""}\n\`\`\``
      : "";
    const pmBlock = result.projectPlan
      ? `\n\n# Project Roadmap & Plan\n\n## Effort Estimation\n${result.projectPlan.effort_estimation}\n\n## Sprint Breakdown\n${result.projectPlan.sprint_breakdown}\n\n## Dependency Graph\n\`\`\`mermaid\n${result.projectPlan.dependency_graph}\n\`\`\`\n\n## Risk Register\n${result.projectPlan.risk_register}`
      : "";
    const fullContent = `# System Architecture Report\nGenerated on ${new Date(result.generatedAt).toLocaleString()}\n\n## Project Summary\n${result.projectSummary}\n\n## Assumptions\n${result.assumptions.map(a => `- ${a}`).join('\n')}\n\n## Open Questions\n${result.openQuestions.map(q => `- ${q}`).join('\n')}\n\n${result.dataModelMarkdown}\n\n${result.systemDesignMarkdown}${tfBlock}${apiBlock}${devopsBlock}${pmBlock}`;
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
    <div className="flex flex-col min-h-screen text-slate-100 bg-slate-950">
      <Header
        result={result}
        copiedFull={copiedFull}
        onCopyFull={copyFullMarkdown}
        onDownload={downloadReport}
        onReset={resetWorkspace}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      
      <LoadingOverlay isGenerating={isGenerating} activeStep={activeStep} />

      {result ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Sidebar Pane */}
          <aside className="bg-slate-800/60 backdrop-blur-xl border-r border-white/10 p-5 flex flex-col gap-6 overflow-y-auto lg:h-[calc(100vh-69px)] lg:w-[320px] xl:w-[360px] flex-shrink-0">
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
              <div className={`${activeTab === "database" && result.domainDesigns && result.domainDesigns.length > 0 ? "max-w-6xl" : "max-w-4xl"} mx-auto w-full bg-slate-800/60 backdrop-blur-xl border border-white/5 p-6 md:p-8 rounded-2xl animate-slide-up bg-slate-950/40`}>
                {activeTab === "requirements" ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <h2 className="text-base font-semibold text-slate-100">Original Requirements Document</h2>
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
                        <h2 className="text-base font-semibold text-slate-100">OpenAPI Specification (openapi.yaml)</h2>
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
                        <h2 className="text-base font-semibold text-slate-100">Terraform Infrastructure as Code (main.tf)</h2>
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
                ) : activeTab === "devops" ? (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/10 pb-4 gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-100">CI/CD & Deployment Configurations</h2>
                        <p className="text-xs text-slate-500 mt-1">Dockerfile, Docker Compose, CI/CD pipelines, and Kubernetes setups</p>
                      </div>

                      {/* Sub-tabs inside DevOps */}
                      <div className="flex gap-1.5 bg-slate-900 border border-white/5 p-1 rounded-xl">
                        {(["dockerfile", "compose", "cicd", "k8s"] as const).map((sub) => {
                          const labels = {
                            dockerfile: "Dockerfile",
                            compose: "docker-compose.yml",
                            cicd: "CI/CD Pipeline",
                            k8s: "Kubernetes (K8s)"
                          };
                          return (
                            <button
                              key={sub}
                              onClick={() => setActiveDevopsSubTab(sub)}
                              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition cursor-pointer ${
                                activeDevopsSubTab === sub
                                  ? "bg-cyan-400 text-slate-950"
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {labels[sub]}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={async () => {
                          if (result.devopsArtifacts) {
                            try {
                              let copyText = "";
                              if (activeDevopsSubTab === "dockerfile") {
                                copyText = result.devopsArtifacts.dockerfile || "";
                                setCopiedDockerfile(true);
                                setTimeout(() => setCopiedDockerfile(false), 2000);
                              } else if (activeDevopsSubTab === "compose") {
                                copyText = result.devopsArtifacts.docker_compose || "";
                                setCopiedCompose(true);
                                setTimeout(() => setCopiedCompose(false), 2000);
                              } else if (activeDevopsSubTab === "cicd") {
                                copyText = result.devopsArtifacts.ci_cd_pipeline || "";
                                setCopiedCiCd(true);
                                setTimeout(() => setCopiedCiCd(false), 2000);
                              } else if (activeDevopsSubTab === "k8s") {
                                copyText = result.devopsArtifacts.k8s_config || "";
                                setCopiedK8s(true);
                                setTimeout(() => setCopiedK8s(false), 2000);
                              }
                              await navigator.clipboard.writeText(copyText);
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 transition cursor-pointer flex items-center gap-1.5 font-semibold self-start sm:self-center"
                      >
                        {(activeDevopsSubTab === "dockerfile" && copiedDockerfile) ||
                        (activeDevopsSubTab === "compose" && copiedCompose) ||
                        (activeDevopsSubTab === "cicd" && copiedCiCd) ||
                        (activeDevopsSubTab === "k8s" && copiedK8s) ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            <span>
                              Copy{" "}
                              {activeDevopsSubTab === "dockerfile"
                                ? "Dockerfile"
                                : activeDevopsSubTab === "compose"
                                ? "docker-compose.yml"
                                : activeDevopsSubTab === "cicd"
                                ? "CI/CD Pipeline"
                                : "Kubernetes Config"}
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    {activeDevopsSubTab === "dockerfile" && (
                      <MarkdownRenderer content={`\`\`\`dockerfile\n${result.devopsArtifacts?.dockerfile || "# No Dockerfile generated."}\n\`\`\``} />
                    )}
                    {activeDevopsSubTab === "compose" && (
                      <MarkdownRenderer content={`\`\`\`yaml\n${result.devopsArtifacts?.docker_compose || "# No docker-compose.yml generated."}\n\`\`\``} />
                    )}
                    {activeDevopsSubTab === "cicd" && (
                      <MarkdownRenderer content={`\`\`\`yaml\n${result.devopsArtifacts?.ci_cd_pipeline || "# No CI/CD pipeline configuration generated."}\n\`\`\``} />
                    )}
                    {activeDevopsSubTab === "k8s" && (
                      <MarkdownRenderer content={`\`\`\`yaml\n${result.devopsArtifacts?.k8s_config || "# No Kubernetes configuration generated."}\n\`\`\``} />
                    )}
                  </div>
                ) : activeTab === "roadmap" ? (
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/10 pb-4 gap-4">
                      <div>
                        <h2 className="text-base font-semibold text-slate-100">Project Development Roadmap & Plan</h2>
                        <p className="text-xs text-slate-500 mt-1">Timeline, effort estimation, module dependencies, and technical risk register</p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 bg-slate-900 border border-white/5 p-1 rounded-xl">
                        {(["sprints", "estimates", "dependencies", "risks"] as const).map((sub) => {
                          const labels = {
                            sprints: "Sprint Schedule",
                            estimates: "Effort Estimates",
                            dependencies: "Dependency Flow",
                            risks: "Risk Register"
                          };
                          return (
                            <button
                              key={sub}
                              onClick={() => setActiveRoadmapSubTab(sub)}
                              className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition cursor-pointer ${
                                activeRoadmapSubTab === sub
                                  ? "bg-cyan-400 text-slate-950"
                                  : "text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {labels[sub]}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={async () => {
                          if (result.projectPlan) {
                            try {
                              let copyText = "";
                              if (activeRoadmapSubTab === "sprints") {
                                copyText = result.projectPlan.sprint_breakdown;
                              } else if (activeRoadmapSubTab === "estimates") {
                                copyText = result.projectPlan.effort_estimation;
                              } else if (activeRoadmapSubTab === "dependencies") {
                                copyText = `\`\`\`mermaid\n${result.projectPlan.dependency_graph}\n\`\`\``;
                              } else if (activeRoadmapSubTab === "risks") {
                                copyText = result.projectPlan.risk_register;
                              }
                              await navigator.clipboard.writeText(copyText);
                              setCopiedRoadmapPart(true);
                              setTimeout(() => setCopiedRoadmapPart(false), 2000);
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                        className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 transition cursor-pointer flex items-center gap-1.5 font-semibold self-start md:self-center"
                      >
                        {copiedRoadmapPart ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                            <span>Copy Section</span>
                          </>
                        )}
                      </button>
                    </div>

                    {result.projectPlan ? (
                      <div className="space-y-4">
                        {activeRoadmapSubTab === "sprints" && (
                          <MarkdownRenderer content={result.projectPlan.sprint_breakdown} />
                        )}
                        {activeRoadmapSubTab === "estimates" && (
                          <MarkdownRenderer content={result.projectPlan.effort_estimation} />
                        )}
                        {activeRoadmapSubTab === "dependencies" && (
                          <div className="p-4 bg-slate-950 border border-white/5 rounded-xl flex justify-center overflow-x-auto">
                            <MarkdownRenderer content={`\`\`\`mermaid\n${result.projectPlan.dependency_graph}\n\`\`\``} />
                          </div>
                        )}
                        {activeRoadmapSubTab === "risks" && (
                          <MarkdownRenderer content={result.projectPlan.risk_register} />
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                        <p className="text-sm text-slate-400">No project plan roadmap is available for this design yet.</p>
                      </div>
                    )}
                  </div>
                ) : previewMode ? (
                  (activeTab === "database" || activeTab === "frontend" || activeTab === "testing") && result.domainDesigns && result.domainDesigns.length > 0 ? (() => {
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
                            activeTab={activeTab}
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
                      <h2 className="text-base font-semibold text-slate-100">
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

            {/* Persistent Chat-to-Refine Bar */}
            <div className="border-t border-white/5 bg-slate-950/80 p-4 backdrop-blur-md flex flex-col gap-2 flex-shrink-0">
              <form onSubmit={handleRefineSubmit} className="flex gap-2 max-w-4xl mx-auto w-full">
                <input
                  type="text"
                  placeholder="Ask to refine the design... (e.g., 'Remove audit_log table from Billing module')"
                  value={refineInput}
                  onChange={(e) => setRefineInput(e.target.value)}
                  disabled={isRefining}
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-655 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isRefining || !refineInput.trim()}
                  className="rounded-xl bg-cyan-500 hover:bg-cyan-400 px-5 py-2.5 text-xs font-semibold text-slate-950 transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-cyan-950/30"
                >
                  {isRefining ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Refining...</span>
                    </>
                  ) : (
                    <>
                      <span>Refine</span>
                      <span>✨</span>
                    </>
                  )}
                </button>
              </form>
              <p className="text-[10px] text-slate-500 text-center">
                Refinements dynamically route to the target module's database agent and re-flow down to API and low-level design layers.
              </p>
            </div>
          </main>
        </div>
      ) : (
        /* Original Form/Landing Layout */
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12 animate-fade-in">
          <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="bg-slate-800/65 backdrop-blur-xl border border-white/5 p-6 sm:p-8 rounded-[32px] flex flex-col justify-between shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-400/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
              <div>
                <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  SRS to Architecture
                </div>
                <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl leading-tight">
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
            <div className="bg-slate-800/65 backdrop-blur-xl border border-white/5 p-6 sm:p-8 rounded-[32px] flex flex-col justify-between shadow-2xl relative">
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
                  cloudProvider={cloudProvider}
                  onShowAdvancedChange={setShowAdvanced}
                  onTechStackChange={setTechStack}
                  onDesignPrinciplesChange={setDesignPrinciples}
                  onSecurityProtocolsChange={setSecurityProtocols}
                  onCloudProviderChange={setCloudProvider}
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
