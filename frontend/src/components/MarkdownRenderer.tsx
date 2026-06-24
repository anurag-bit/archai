import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { MermaidRenderer } from "./MermaidRenderer";

function CodeBlock({ children, lang, className, ...props }: any) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(children).replace(/\n$/, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 shadow-lg bg-slate-950">
      <div className="bg-slate-900/60 backdrop-blur-md px-4 py-1.5 text-xs text-slate-400 font-mono flex items-center justify-between border-b border-white/5 select-none">
        <span>{lang || "code"}</span>
        <button
          onClick={handleCopy}
          className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-[11px] font-medium"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5 text-emerald-400 animate-fade-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-400 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-4 text-xs leading-5">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match ? match[1] : null;
            const value = String(children).replace(/\n$/, "");

            if (lang === "mermaid") {
              return <MermaidRenderer chart={value} />;
            }

            const isInline = !className;

            if (isInline) {
              return (
                <code className="text-xs bg-slate-900/80 px-1.5 py-0.5 rounded border border-white/5 font-mono text-cyan-300" {...props}>
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock lang={lang} className={className} {...props}>
                {children}
              </CodeBlock>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
