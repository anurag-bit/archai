import React from "react";

interface ProjectSummaryProps {
  summary: string;
}

export function ProjectSummary({ summary }: ProjectSummaryProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Project Summary</h3>
      <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 text-xs leading-6 text-slate-300 shadow-inner">
        {summary}
      </div>
    </div>
  );
}
