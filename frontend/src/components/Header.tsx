import React from "react";

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
};

interface HeaderProps {
  result: DesignResponse | null;
  copiedFull: boolean;
  onCopyFull: () => void;
  onDownload: () => void;
  onReset: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function Header({
  result,
  copiedFull,
  onCopyFull,
  onDownload,
  onReset,
  theme,
  onToggleTheme,
}: HeaderProps) {
  return (
    <header className="bg-slate-800/60 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between shadow-lg sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/10">
          <svg className="w-5 h-5 text-slate-950 font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7a48.656 48.656 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M3 12l-3 3m3-3l3 3" />
          </svg>
        </div>
        <span className="font-semibold text-lg tracking-tight text-slate-100">Archai</span>
      </div>
      
      {result && (
        <div className="hidden md:flex items-center gap-6">
          <div className="text-xs text-slate-400 flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Size: <strong className="text-slate-200">{result.documentLength?.toLocaleString() ?? 0} chars</strong>
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              RAG Chunks: <strong className="text-slate-200">{result.selectedChunkCount ?? 0}</strong>
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleTheme}
          aria-label="Toggle Theme"
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-350 hover:text-white transition border border-white/5 cursor-pointer flex items-center justify-center"
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4 text-amber-400 animate-pulse-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {result ? (
          <>
            <button
              onClick={onCopyFull}
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
              onClick={onDownload}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 hover:text-white transition flex items-center gap-1.5 border border-white/5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              <span className="hidden sm:inline">Download MD</span>
            </button>

            <button
              onClick={onReset}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-xs font-semibold text-slate-950 transition flex items-center gap-1.5 shadow-md shadow-cyan-400/10 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              <span>New Design</span>
            </button>
          </>
        ) : (
          <span className="text-xs text-slate-500 font-mono ml-2">v1.2.0</span>
        )}
      </div>
    </header>
  );
}
