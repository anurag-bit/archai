import React from "react";

interface WorkspaceTabsProps {
  activeTab: "architecture" | "database" | "requirements" | "terraform" | "openapi";
  previewMode: boolean;
  onTabChange: (tab: "architecture" | "database" | "requirements" | "terraform" | "openapi") => void;
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
      {activeTab !== "requirements" && activeTab !== "terraform" && activeTab !== "openapi" && (
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

