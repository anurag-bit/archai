"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";

if (typeof window !== "undefined") {
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
    themeVariables: {
      primaryColor: "#0891b2", // cyan-600
      primaryTextColor: "#f8fafc", // slate-50
      lineColor: "#64748b", // slate-500
      primaryBorderColor: "#22d3ee", // cyan-400
      nodeBorder: "#334155", // slate-700
      mainBkg: "#0f172a", // slate-900
      actorBkg: "#0f172a",
      actorBorder: "#334155",
      signalColor: "#22d3ee",
      signalLineColor: "#64748b",
      cardinalityStroke: "#64748b",
    },
  });
}

function splitAttributes(content: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuote) {
      if (char === quoteChar && content[i - 1] !== "\\") {
        inQuote = false;
      }
      current += char;
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if ((char === "," || char === "\n") && parenDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseAttributeLine(line: string): string {
  let cleaned = line.trim();
  if (!cleaned) return "";

  const tokens: { value: string; isQuoted: boolean }[] = [];
  const tokenRegex = /"([^"]*)"|(\S+)/g;
  let match;
  while ((match = tokenRegex.exec(cleaned)) !== null) {
    if (match[1] !== undefined) {
      tokens.push({ value: match[1], isQuoted: true });
    } else {
      tokens.push({ value: match[2], isQuoted: false });
    }
  }

  if (tokens.length === 0) return "";

  // 1. Extract type
  let rawTypeObj = tokens[0];
  let rawType = rawTypeObj.value;
  let baseType = rawType;
  let typeExtra = "";
  
  const parenMatch = rawType.match(/^([^(]+)\(([^)]+)\)$/);
  if (parenMatch) {
    baseType = parenMatch[1];
    typeExtra = `(${parenMatch[2]})`;
  }
  
  baseType = baseType.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!baseType) baseType = "unknown";

  // 2. Extract name
  if (tokens.length === 1) {
    return `    ${baseType} unnamed`;
  }

  let rawNameObj = tokens[1];
  let name = rawNameObj.value.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!name) name = "unnamed_field";

  // 3. Extract PK/FK and Comments
  let isPK = false;
  let isFK = false;
  const comments: string[] = [];

  if (typeExtra) {
    comments.push(typeExtra);
  }

  for (let i = 2; i < tokens.length; i++) {
    const tok = tokens[i];
    const valUpper = tok.value.toUpperCase();
    if (!tok.isQuoted && valUpper === "PK") {
      isPK = true;
    } else if (!tok.isQuoted && valUpper === "FK") {
      isFK = true;
    } else {
      comments.push(tok.value);
    }
  }

  let keyStr = "";
  if (isPK) {
    keyStr = " PK";
  } else if (isFK) {
    keyStr = " FK";
  }

  let commentStr = "";
  if (comments.length > 0) {
    const joined = comments.join(" ").replace(/"/g, '\\"');
    commentStr = ` "${joined}"`;
  }

  return `    ${baseType} ${name}${keyStr}${commentStr}`;
}

function preprocessMermaidChart(chart: string): string {
  if (!chart || typeof chart !== "string") return "";

  let processed = chart.trim();

  if (!processed.includes("erDiagram")) {
    return chart;
  }

  // Pre-sanitize reserved keywords (like CLASS) in the frontend chart string
  const reservedKeywords = ["class", "state", "title", "graph", "relation", "entity", "classdiagram", "erdiagram"];
  reservedKeywords.forEach(keyword => {
    // Replace unquoted keyword table names with quoted versions
    // Example: CLASS { -> "CLASS" {
    const entityDefRegex = new RegExp(`(^|\\r?\\n|\\s)(${keyword})\\s*\\{`, "gi");
    processed = processed.replace(entityDefRegex, '$1"$2" {');

    // For relationships: we match word boundary for the keyword
    // relLeftRegex: CLASS ||--o{
    const relLeftRegex = new RegExp(`(^|\\r?\\n|\\s)(${keyword})\\s+([|o{}-]+)`, "gi");
    processed = processed.replace(relLeftRegex, '$1"$2" $3');
    
    // relRightRegex: ||--o{ CLASS
    const relRightRegex = new RegExp(`([|o{}-]+)\\s+(${keyword})(\\s|:|$)`, "gi");
    processed = processed.replace(relRightRegex, '$1 "$2"$3');
  });

  const entityRegex = /(^|\r?\n)(\s*)("[a-zA-Z_][a-zA-Z0-9_-]*"|[a-zA-Z_][a-zA-Z0-9_-]*)\s*\{([^}]*)\}/g;

  processed = processed.replace(entityRegex, (match, newline, indent, entityName, attributesContent) => {
    const lines = splitAttributes(attributesContent);
    const cleanedLines = lines
      .map(line => parseAttributeLine(line))
      .filter(line => line !== "");

    return `${newline}${indent}${entityName} {\n${cleanedLines.map(l => indent + "  " + l.trim()).join("\n")}\n${indent}}`;
  });

  return processed;
}

// Helpers for zooming and pan calculations
const zoomAtCenter = (
  factor: number,
  viewport: HTMLDivElement | null,
  transform: { x: number; y: number; scale: number },
  setTransform: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>
) => {
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const newScale = Math.min(Math.max(transform.scale * factor, 0.15), 5);
  const newX = centerX - (centerX - transform.x) * (newScale / transform.scale);
  const newY = centerY - (centerY - transform.y) * (newScale / transform.scale);

  setTransform({ scale: newScale, x: newX, y: newY });
};

const resetView = (
  viewport: HTMLDivElement | null,
  container: HTMLDivElement | null,
  svgDimensions: { width: number; height: number },
  setTransform: React.Dispatch<React.SetStateAction<{ x: number; y: number; scale: number }>>
) => {
  if (!viewport || !container) return;
  const svgElement = container.querySelector("svg");
  if (!svgElement) return;

  svgElement.setAttribute("width", "100%");
  svgElement.setAttribute("height", "100%");
  svgElement.style.maxWidth = "none";
  svgElement.style.maxHeight = "none";

  const containerRect = viewport.getBoundingClientRect();
  const scaleX = (containerRect.width - 32) / svgDimensions.width;
  const scaleY = (containerRect.height - 32) / svgDimensions.height;

  const initialScale = Math.min(scaleX, scaleY, 1.2);
  const x = (containerRect.width - svgDimensions.width * initialScale) / 2;
  const y = (containerRect.height - svgDimensions.height * initialScale) / 2;

  setTransform({ x, y, scale: initialScale });
};

export function MermaidRenderer({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenViewportRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [svgDimensions, setSvgDimensions] = useState({ width: 800, height: 600 });

  // Transforms
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [fullscreenTransform, setFullscreenTransform] = useState({ x: 0, y: 0, scale: 1 });

  // Dragging states
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [isFsDragging, setIsFsDragging] = useState(false);
  const [fsDragStart, setFsDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Inline render
  useEffect(() => {
    let active = true;
    if (!containerRef.current || !chart) return;

    const renderChart = async () => {
      try {
        setError(null);
        const cleanChart = preprocessMermaidChart(chart);
        const renderId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(renderId, cleanChart);
        
        if (active && containerRef.current) {
          containerRef.current.innerHTML = svg;
          
          let svgWidth = 800;
          let svgHeight = 600;
          const svgElement = containerRef.current.querySelector("svg");
          if (svgElement && svgElement.viewBox && svgElement.viewBox.baseVal) {
            const vb = svgElement.viewBox.baseVal;
            if (vb.width > 0 && vb.height > 0) {
              svgWidth = vb.width;
              svgHeight = vb.height;
            }
          }
          
          const dims = { width: svgWidth, height: svgHeight };
          setSvgDimensions(dims);

          requestAnimationFrame(() => {
            resetView(viewportRef.current, containerRef.current, dims, setTransform);
          });
        }
      } catch (err: any) {
        console.error("Mermaid parsing error:", err);
        if (active) {
          setError(err instanceof Error ? err.message : "Invalid Mermaid Diagram syntax");
        }
        const badElements = document.querySelectorAll(`[id^="dmermaid-"]`);
        badElements.forEach((el) => el.remove());
      }
    };

    renderChart();

    return () => {
      active = false;
    };
  }, [chart]);

  // Fullscreen render
  useEffect(() => {
    let active = true;
    if (!isFullscreen || !fullscreenContainerRef.current || !chart) return;

    const renderFullscreenChart = async () => {
      try {
        const cleanChart = preprocessMermaidChart(chart);
        const renderId = `mermaid-fs-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(renderId, cleanChart);
        
        if (active && fullscreenContainerRef.current) {
          fullscreenContainerRef.current.innerHTML = svg;
          
          requestAnimationFrame(() => {
            resetView(
              fullscreenViewportRef.current,
              fullscreenContainerRef.current,
              svgDimensions,
              setFullscreenTransform
            );
          });
        }
      } catch (err) {
        console.error("Fullscreen rendering error:", err);
      }
    };

    renderFullscreenChart();

    return () => {
      active = false;
    };
  }, [isFullscreen, chart, svgDimensions]);

  // Auto resize listener
  useEffect(() => {
    const handleResize = () => {
      resetView(viewportRef.current, containerRef.current, svgDimensions, setTransform);
      if (isFullscreen) {
        resetView(
          fullscreenViewportRef.current,
          fullscreenContainerRef.current,
          svgDimensions,
          setFullscreenTransform
        );
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isFullscreen, svgDimensions]);

  // Escape key exit fullscreen listener
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Inline view zoom/pan handlers
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(Math.max(transform.scale * (direction > 0 ? zoomFactor : 1 / zoomFactor), 0.15), 5);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
    const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
    
    setTransform({ scale: newScale, x: newX, y: newY });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setTransform({
      scale: transform.scale,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Fullscreen view zoom/pan handlers
  const handleFsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.min(Math.max(fullscreenTransform.scale * (direction > 0 ? zoomFactor : 1 / zoomFactor), 0.15), 5);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const newX = mouseX - (mouseX - fullscreenTransform.x) * (newScale / fullscreenTransform.scale);
    const newY = mouseY - (mouseY - fullscreenTransform.y) * (newScale / fullscreenTransform.scale);
    
    setFullscreenTransform({ scale: newScale, x: newX, y: newY });
  };

  const handleFsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setIsFsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setFsDragStart({ x: e.clientX - fullscreenTransform.x, y: e.clientY - fullscreenTransform.y });
  };

  const handleFsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isFsDragging) return;
    setFullscreenTransform({
      scale: fullscreenTransform.scale,
      x: e.clientX - fsDragStart.x,
      y: e.clientY - fsDragStart.y,
    });
  };

  const handleFsPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isFsDragging) return;
    setIsFsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs font-mono text-rose-300">
        <div className="font-semibold text-rose-400 mb-2">⚠️ Mermaid Rendering Error</div>
        <pre className="overflow-x-auto whitespace-pre-wrap">{error}</pre>
        <details className="mt-2 text-slate-400 cursor-pointer">
          <summary className="hover:text-slate-300">View Source Diagram</summary>
          <pre className="mt-2 bg-slate-950 p-2 rounded border border-white/5">{chart}</pre>
        </details>
      </div>
    );
  }

  return (
    <>
      <div className="relative my-6 w-full rounded-2xl border border-white/10 bg-slate-950/40 p-1 shadow-inner backdrop-blur-sm overflow-hidden flex flex-col group">
        {/* Floating Toolbar Controls */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-0.5 p-1 rounded-xl bg-slate-950/80 border border-white/10 backdrop-blur-md shadow-lg opacity-85 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => zoomAtCenter(1.2, viewportRef.current, transform, setTransform)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => zoomAtCenter(1 / 1.2, viewportRef.current, transform, setTransform)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => resetView(viewportRef.current, containerRef.current, svgDimensions, setTransform)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Reset View"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
            </svg>
          </button>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Full Screen"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m12 4V4h-4M4 16v4h4m12-4v4h-4" />
            </svg>
          </button>
        </div>

        {/* Viewport */}
        <div 
          ref={viewportRef}
          className="relative w-full h-[400px] overflow-hidden select-none cursor-grab active:cursor-grabbing rounded-xl bg-slate-950/20"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div 
            ref={containerRef}
            style={{
              width: svgDimensions.width,
              height: svgDimensions.height,
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "0 0",
            }}
            className="relative transition-transform duration-75 ease-out flex items-center justify-center"
          />
        </div>
      </div>

      {/* Fullscreen Modal Portal */}
      {isFullscreen && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col p-6 select-none animate-fade-in text-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">System Diagram View</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Drag to pan, scroll to zoom. Use ESC key to close.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-350 hover:text-white transition-all flex items-center gap-1.5 border border-white/5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Close Fullscreen</span>
            </button>
          </div>

          {/* Fullscreen Viewport wrapper */}
          <div className="relative flex-1 rounded-2xl border border-white/10 bg-slate-950/40 overflow-hidden flex flex-col">
            {/* Floating Controls inside Fullscreen */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-0.5 p-1 rounded-xl bg-slate-950/80 border border-white/10 backdrop-blur-md shadow-lg">
              <button
                type="button"
                onClick={() => zoomAtCenter(1.2, fullscreenViewportRef.current, fullscreenTransform, setFullscreenTransform)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => zoomAtCenter(1 / 1.2, fullscreenViewportRef.current, fullscreenTransform, setFullscreenTransform)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => resetView(fullscreenViewportRef.current, fullscreenContainerRef.current, svgDimensions, setFullscreenTransform)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                title="Reset View"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
                </svg>
              </button>
            </div>

            {/* Viewport container */}
            <div 
              ref={fullscreenViewportRef}
              className="relative flex-1 overflow-hidden select-none cursor-grab active:cursor-grabbing bg-slate-950/20"
              onWheel={handleFsWheel}
              onPointerDown={handleFsPointerDown}
              onPointerMove={handleFsPointerMove}
              onPointerUp={handleFsPointerUp}
              onPointerLeave={handleFsPointerUp}
            >
              <div 
                ref={fullscreenContainerRef}
                style={{
                  width: svgDimensions.width,
                  height: svgDimensions.height,
                  transform: `translate(${fullscreenTransform.x}px, ${fullscreenTransform.y}px) scale(${fullscreenTransform.scale})`,
                  transformOrigin: "0 0",
                }}
                className="relative transition-transform duration-75 ease-out flex items-center justify-center"
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

