import React from "react";

interface AdvancedConfigProps {
  showAdvanced: boolean;
  techStack: string;
  designPrinciples: string;
  securityProtocols: string;
  onShowAdvancedChange: (show: boolean) => void;
  onTechStackChange: (val: string) => void;
  onDesignPrinciplesChange: (val: string) => void;
  onSecurityProtocolsChange: (val: string) => void;
}

export function AdvancedConfig({
  showAdvanced,
  techStack,
  designPrinciples,
  securityProtocols,
  onShowAdvancedChange,
  onTechStackChange,
  onDesignPrinciplesChange,
  onSecurityProtocolsChange,
}: AdvancedConfigProps) {
  return (
    <div className="border border-white/5 bg-slate-900/10 rounded-2xl overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={() => onShowAdvancedChange(!showAdvanced)}
        className="flex items-center justify-between w-full px-4 py-3 text-xs font-semibold text-slate-350 hover:text-white bg-slate-900/20 hover:bg-slate-900/40 transition cursor-pointer select-none"
      >
        <span className="flex items-center gap-2">
          <span>⚙️</span>
          <span>Advanced Configuration (Optional)</span>
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-300 ${
            showAdvanced ? "transform rotate-180 text-cyan-400" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {showAdvanced && (
        <div className="p-4 space-y-4 border-t border-white/5 bg-slate-950/20 animate-fade-in">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
              Target Tech Stack
            </label>
            <textarea
              placeholder="e.g., PostgreSQL, FastAPI, Redis, React"
              value={techStack}
              onChange={(e) => onTechStackChange(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-650 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
              Design Principles
            </label>
            <textarea
              placeholder="e.g., Microservices, Event Sourcing, CQRS, DDD"
              value={designPrinciples}
              onChange={(e) => onDesignPrinciplesChange(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-650 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider block">
              Security Protocols
            </label>
            <textarea
              placeholder="e.g., Role-Based Access Control, AES-256 field encryption"
              value={securityProtocols}
              onChange={(e) => onSecurityProtocolsChange(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-5 text-slate-100 outline-none transition placeholder:text-slate-650 focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-400/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}
