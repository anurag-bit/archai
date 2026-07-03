import React from "react";

const loadingSteps = [
  "Ingesting requirements & parsing document layout...",
  "Querying vector store & retrieving relevant context...",
  "Phase 1: Generating modular database schemas & API lists...",
  "Phase 2: Synthesizing global service topology & gateways...",
  "Assembling document sections & rendering diagrams..."
];

interface LoadingOverlayProps {
  isGenerating: boolean;
  activeStep: number;
  modulesList?: string[];
  completedModules?: string[];
  nodeProgress?: Record<string, string[]>;
}

export function LoadingOverlay({ 
  isGenerating, 
  activeStep, 
  modulesList = [], 
  completedModules = [],
  nodeProgress = {}
}: LoadingOverlayProps) {
  if (!isGenerating) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-md px-4 py-8 animate-fade-in">
      <div className="max-w-md w-full bg-slate-800/70 backdrop-blur-2xl border border-[var(--accent)] shadow-2xl shadow-[var(--accent-strong)]/5 p-8 rounded-3xl text-center flex flex-col items-center gap-6">
        {/* Animated glowing spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-slate-850"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-cyan-400 border-r-cyan-400/40 animate-spin"></div>
          <div className="absolute inset-0 rounded-full bg-cyan-400/10 blur-xl"></div>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold bg-gradient-to-r from-[var(--accent-gradient-start)] to-[var(--accent-gradient-end)] bg-clip-text text-transparent tracking-tight drop-shadow-[0_0_15px_rgba(56,189,248,0.25)]">Generating System Architecture</h2>
          <p className="text-xs text-slate-400 mt-1">This typically takes 20-30 seconds depending on LLM mapping</p>
        </div>

        <div className="w-full space-y-4 text-left border-t border-white/5 pt-6 mt-2">
          {loadingSteps.map((step, idx) => {
            const isDone = idx < activeStep;
            const isActive = idx === activeStep;
            return (
              <div key={idx} className="flex flex-col gap-1 text-xs">
                <div className="flex items-start gap-3 leading-5">
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
                {idx === 2 && (isActive || isDone) && modulesList && modulesList.length > 0 && (
                  <div className="pl-7 pr-2 space-y-2.5 border-l border-white/10 ml-2 mt-1 mb-2 animate-fade-in max-h-60 overflow-y-auto">
                    {modulesList.map((m, mIdx) => {
                      const isModuleDone = completedModules.includes(m);
                      const activeNodes = nodeProgress[m] || [];
                      
                      const stages = [
                        { key: "dba_agent", label: "Schema" },
                        { key: "api_agent", label: "API" },
                        { key: "lld_agent", label: "LLD" },
                        { key: "frontend_agent", label: "UI" },
                        { key: "qa_agent", label: "Tests" }
                      ];

                      return (
                        <div key={mIdx} className="flex flex-col gap-1 py-0.5 border-b border-white/5 last:border-0 pb-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={isModuleDone ? "text-slate-500 line-through decoration-slate-700 font-semibold" : "text-cyan-100 font-semibold"}>
                              {m}
                            </span>
                            {isModuleDone ? (
                              <span className="text-emerald-400 text-[10px] font-bold">✓ Done</span>
                            ) : (
                              <span className="text-cyan-400 animate-pulse text-[10px]">Processing...</span>
                            )}
                          </div>
                          
                          {!isModuleDone && (
                            <div className="pl-2 mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-[9px] text-slate-400">
                              {stages.map((stage) => {
                                const stageDone = activeNodes.includes(stage.key);
                                return (
                                  <div key={stage.key} className="flex items-center gap-0.5">
                                    {stageDone ? (
                                      <span className="text-emerald-400">✓</span>
                                    ) : (
                                      <span className="inline-block w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></span>
                                    )}
                                    <span className={stageDone ? "text-slate-500 line-through" : "text-cyan-200/80"}>
                                      {stage.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
