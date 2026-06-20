import React from "react";

interface OpenQuestionsProps {
  questions: string[];
  answers: Record<number, string>;
  isGenerating: boolean;
  onAnswerChange: (index: number, val: string) => void;
  onClearAnswers: () => void;
  onSubmitAnswers: () => void;
}

export function OpenQuestions({
  questions,
  answers,
  isGenerating,
  onAnswerChange,
  onClearAnswers,
  onSubmitAnswers,
}: OpenQuestionsProps) {
  const hasAnswers = Object.values(answers).some((a) => a.trim() !== "");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
          Open Questions ({questions.length})
        </h3>
        {hasAnswers && (
          <button
            onClick={onClearAnswers}
            className="text-[10px] text-slate-500 hover:text-slate-350 hover:underline transition cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
      <ul className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
        {questions.map((item, idx) => (
          <li
            key={idx}
            className="bg-slate-900/30 border border-white/5 rounded-xl p-3 text-[11px] leading-4 text-slate-400 transition-all"
          >
            <div className="font-semibold text-slate-200 mb-2 leading-relaxed">{item}</div>
            <textarea
              placeholder="Address this question..."
              value={answers[idx] || ""}
              onChange={(e) => onAnswerChange(idx, e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 p-2 text-[10.5px] leading-4 text-slate-100 outline-none transition placeholder:text-slate-650 focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 resize-none"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSubmitAnswers}
        disabled={isGenerating || !hasAnswers}
        className="w-full py-2 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-slate-950 font-bold rounded-xl text-xs hover:shadow-lg hover:shadow-violet-500/15 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18" />
        </svg>
        <span>Apply Answers & Regenerate</span>
      </button>
    </div>
  );
}
