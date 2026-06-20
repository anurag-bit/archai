import React from "react";
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

interface ModuleSpecProps {
  activeDesign: DomainDesign;
}

export function ModuleSpec({ activeDesign }: ModuleSpecProps) {
  const sql = activeDesign.design?.sql_ddl || "";
  const apis = (activeDesign.design?.api_endpoints || []).join("\n");

  const handleCopySpec = async () => {
    try {
      await navigator.clipboard.writeText(
        `# ${activeDesign.module}\n\n## SQL DDL\n\`\`\`sql\n${sql}\n\`\`\`\n\n## API Endpoints\n${apis}`
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">{activeDesign.module}</h2>
          <p className="text-xs text-slate-500 mt-1">Database and API Specification</p>
        </div>
        
        <button
          type="button"
          onClick={handleCopySpec}
          className="text-[10px] bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/5 transition flex items-center gap-1.5 cursor-pointer font-semibold"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
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
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              API Endpoints ({activeDesign.design.api_endpoints.length})
            </h4>
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
                  <div
                    key={i}
                    className="bg-slate-900/30 border border-white/5 rounded-xl p-3 flex items-center gap-3 font-mono text-[11px] hover:border-white/10 transition"
                  >
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold ${badgeColor}`}>{method}</span>
                    <span className="text-slate-300 truncate select-all">{path}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
