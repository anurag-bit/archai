import React from "react";

interface SourceChunksProps {
  chunkCount: number;
  highlights: string[];
}

export function SourceChunks({ chunkCount, highlights }: SourceChunksProps) {
  return (
    <div className="space-y-2 flex-1 flex flex-col min-h-[180px]">
      <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
        RAG Source Chunks ({chunkCount})
      </h3>
      <ul className="space-y-2 overflow-y-auto pr-1 flex-1 max-h-[220px] lg:max-h-none">
        {highlights.map((item, idx) => {
          const match = item.match(/^(Chunk \d+(?:\s+\[[^\]]+\])?\s*\|\s*score\s*[\d\.]+):\s*(.*)$/);
          const headerText = match ? match[1] : `Source Highlight ${idx + 1}`;
          const contentText = match ? match[2] : item;
          return (
            <li
              key={idx}
              className="bg-slate-900/30 border border-white/5 rounded-xl p-3 text-[11px] hover:bg-slate-900/50 hover:border-emerald-500/20 transition group"
            >
              <div className="font-semibold text-slate-300 font-mono text-[10px] text-emerald-400/80 mb-1.5 flex items-center justify-between">
                <span>{headerText}</span>
                <svg className="w-3.5 h-3.5 text-slate-650 group-hover:text-emerald-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="leading-4 text-slate-400 font-mono text-[10px] line-clamp-3 select-all">{contentText}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
