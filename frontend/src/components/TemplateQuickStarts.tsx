import React from "react";

interface Template {
  title: string;
  icon: string;
  description: string;
  requirements: string;
}

interface TemplateQuickStartsProps {
  templates: Template[];
  onLoadTemplate: (sample: string) => void;
}

export function TemplateQuickStarts({ templates, onLoadTemplate }: TemplateQuickStartsProps) {
  return (
    <div className="mt-8 border-t border-white/5 pt-6">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quick Templates</div>
      <div className="grid gap-3 sm:grid-cols-3">
        {templates.map((tmpl) => (
          <button
            key={tmpl.title}
            type="button"
            onClick={() => onLoadTemplate(tmpl.requirements)}
            className="text-left bg-slate-900/40 border border-white/5 p-3 rounded-xl hover:border-cyan-400/20 hover:bg-slate-900/60 active:scale-[0.98] transition-all duration-300 cursor-pointer flex flex-col gap-1.5 group"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm group-hover:scale-110 transition duration-300">{tmpl.icon}</span>
              <span className="text-[11px] font-bold text-slate-300 group-hover:text-cyan-300 transition duration-300">
                {tmpl.title}
              </span>
            </div>
            <p className="text-[9.5px] leading-3.5 text-slate-500 group-hover:text-slate-400 transition line-clamp-2">
              {tmpl.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
