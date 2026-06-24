import React from "react";

interface AssumptionsProps {
  assumptions: string[];
}

export function Assumptions({ assumptions }: AssumptionsProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
        Assumptions ({assumptions.length})
      </h3>
      <ul className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
        {assumptions.map((item, idx) => (
          <li
            key={idx}
            className="bg-slate-900/30 border border-white/5 rounded-xl p-3 text-[11px] leading-4 text-slate-400 hover:text-slate-300 transition"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
