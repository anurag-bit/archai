import React from "react";

type DomainDesign = {
  module: string;
  design: {
    er_diagram_mermaid?: string;
    sql_ddl?: string;
    api_endpoints?: string[];
  };
  error?: string;
};

interface ModuleSelectorProps {
  domainDesigns: DomainDesign[];
  selectedModuleIndex: number;
  onSelectModule: (index: number) => void;
}

export function ModuleSelector({
  domainDesigns,
  selectedModuleIndex,
  onSelectModule,
}: ModuleSelectorProps) {
  return (
    <div className="w-full lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 pb-6 lg:pb-0 lg:pr-6 flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2">Modules</h3>
      <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-none max-h-[300px] lg:max-h-[500px] overflow-y-auto">
        {domainDesigns.map((d, idx) => {
          const isSelected = idx === selectedModuleIndex;
          const tableCount = (d.design?.sql_ddl?.match(/CREATE TABLE/gi) || []).length;
          const apiCount = d.design?.api_endpoints?.length || 0;
          return (
            <button
              key={d.module}
              type="button"
              onClick={() => onSelectModule(idx)}
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
              <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isSelected ? "text-cyan-400 translate-x-0.5" : "text-slate-650"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
