import React from "react";

interface WorkspaceTabsProps {
  activeTab: "architecture" | "database" | "frontend" | "testing" | "requirements" | "terraform" | "openapi" | "devops" | "roadmap";
  previewMode: boolean;
  onTabChange: (tab: "architecture" | "database" | "frontend" | "testing" | "requirements" | "terraform" | "openapi" | "devops" | "roadmap") => void;
  onPreviewModeChange: (preview: boolean) => void;
}

export function WorkspaceTabs({
  activeTab,
  previewMode,
  onTabChange,
  onPreviewModeChange,
}: WorkspaceTabsProps) {
  return (
    <div className="bg-slate-900/40 border-b border-white/10 px-6 py-2.5 flex flex-col sm:flex-row gap-3 items-center justify-between select-none">
      {/* Tab options */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onTabChange("architecture")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "architecture"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          System Architecture
        </button>

        <button
          onClick={() => onTabChange("database")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "database"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 5c0 2.21-3.58 4-8 4s-8-1.79-8-4" />
          </svg>
          Database Schema
        </button>

        <button
          onClick={() => onTabChange("frontend")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "frontend"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Frontend UI
        </button>

        <button
          onClick={() => onTabChange("testing")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "testing"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          QA & Testing
        </button>

        <button
          onClick={() => onTabChange("openapi")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "openapi"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          OpenAPI Spec
        </button>

        <button
          onClick={() => onTabChange("terraform")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "terraform"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Terraform (IaC)
        </button>

        <button
          onClick={() => onTabChange("devops")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "devops"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          DevOps & CI/CD
        </button>

        <button
          onClick={() => onTabChange("roadmap")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "roadmap"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m0 4l3 3L8 13m0-6H5m3 14v-4m0 4l3-3m-3 3H5m11-1h6m-6-4h6m2 5h-8a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v14a2 2 0 01-2 2z" />
          </svg>
          Project Roadmap
        </button>

        <button
          onClick={() => onTabChange("requirements")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-2 cursor-pointer ${
            activeTab === "requirements"
              ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[0_0_12px_rgba(122,160,138,0.05)]"
              : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Original Requirements
        </button>
      </div>

      {/* View options */}
      {activeTab !== "requirements" && activeTab !== "terraform" && activeTab !== "openapi" && activeTab !== "devops" && activeTab !== "roadmap" && activeTab !== "frontend" && activeTab !== "testing" && (
        <div className="flex items-center gap-3 bg-slate-950/60 border border-white/5 px-2.5 py-1 rounded-lg">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Format</span>
          <div className="flex gap-0.5">
            <button
              onClick={() => onPreviewModeChange(true)}
              className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                previewMode
                  ? "bg-cyan-400 text-slate-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => onPreviewModeChange(false)}
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
  );
}

