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
      primaryColor: "#5d826d", // earthy sage green
      primaryTextColor: "#f5f5f0", // warm off-white
      lineColor: "#6e6e6a", // warm slate gray
      primaryBorderColor: "#7aa08a", // sage accent
      nodeBorder: "#252523", // charcoal border
      mainBkg: "#0f0f0e", // warm coal background
      actorBkg: "#0f0f0e",
      actorBorder: "#252523",
      signalColor: "#7aa08a",
      signalLineColor: "#6e6e6a",
      cardinalityStroke: "#6e6e6a",
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

interface IconMapItem {
  keywords: string[];
  url: string;
  invert?: boolean;
}

const ICON_MAPPING: IconMapItem[] = [
  // Frameworks & Libraries
  { keywords: ["next.js", "nextjs"], url: "https://skillicons.dev/icons?i=nextjs" },
  { keywords: ["react"], url: "https://skillicons.dev/icons?i=react" },
  { keywords: ["vue"], url: "https://skillicons.dev/icons?i=vue" },
  { keywords: ["angular"], url: "https://skillicons.dev/icons?i=angular" },
  { keywords: ["svelte"], url: "https://skillicons.dev/icons?i=svelte" },
  { keywords: ["fastapi"], url: "https://skillicons.dev/icons?i=fastapi" },
  { keywords: ["django"], url: "https://skillicons.dev/icons?i=django" },
  { keywords: ["flask"], url: "https://skillicons.dev/icons?i=flask" },
  { keywords: ["express"], url: "https://skillicons.dev/icons?i=express" },
  { keywords: ["nestjs", "nest.js"], url: "https://skillicons.dev/icons?i=nest" },
  { keywords: ["spring boot", "spring framework", "spring"], url: "https://skillicons.dev/icons?i=spring" },
  { keywords: ["laravel"], url: "https://skillicons.dev/icons?i=laravel" },
  { keywords: ["flutter"], url: "https://skillicons.dev/icons?i=flutter" },

  // Databases & Caches
  { keywords: ["postgresql", "postgres"], url: "https://skillicons.dev/icons?i=postgres" },
  { keywords: ["redis"], url: "https://skillicons.dev/icons?i=redis" },
  { keywords: ["mysql"], url: "https://skillicons.dev/icons?i=mysql" },
  { keywords: ["mongodb", "mongo"], url: "https://skillicons.dev/icons?i=mongodb" },
  { keywords: ["sqlite"], url: "https://skillicons.dev/icons?i=sqlite" },
  { keywords: ["cassandra"], url: "https://skillicons.dev/icons?i=cassandra" },
  { keywords: ["dynamodb"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazondynamodb.svg", invert: true },
  { keywords: ["elasticsearch", "opensearch"], url: "https://skillicons.dev/icons?i=elasticsearch" },
  { keywords: ["supabase"], url: "https://skillicons.dev/icons?i=supabase" },
  { keywords: ["firebase"], url: "https://skillicons.dev/icons?i=firebase" },
  { keywords: ["prisma"], url: "https://skillicons.dev/icons?i=prisma" },

  // Languages & Runtimes
  { keywords: ["nodejs", "node.js", "node run"], url: "https://skillicons.dev/icons?i=nodejs" },
  { keywords: ["python"], url: "https://skillicons.dev/icons?i=python" },
  { keywords: ["golang", "go lang"], url: "https://skillicons.dev/icons?i=go" },
  { keywords: ["rust"], url: "https://skillicons.dev/icons?i=rust" },
  { keywords: ["java "], url: "https://skillicons.dev/icons?i=java" },
  { keywords: ["typescript", "ts"], url: "https://skillicons.dev/icons?i=ts" },
  { keywords: ["javascript", "js"], url: "https://skillicons.dev/icons?i=js" },
  { keywords: ["cpp", "c++"], url: "https://skillicons.dev/icons?i=cpp" },
  { keywords: ["ruby"], url: "https://skillicons.dev/icons?i=ruby" },
  { keywords: ["php"], url: "https://skillicons.dev/icons?i=php" },
  { keywords: ["elixir"], url: "https://skillicons.dev/icons?i=elixir" },
  { keywords: ["swift"], url: "https://skillicons.dev/icons?i=swift" },
  { keywords: ["kotlin"], url: "https://skillicons.dev/icons?i=kotlin" },

  // DevOps & Server
  { keywords: ["docker"], url: "https://skillicons.dev/icons?i=docker" },
  { keywords: ["kubernetes", "k8s", "eks", "gke", "aks"], url: "https://skillicons.dev/icons?i=kubernetes" },
  { keywords: ["terraform"], url: "https://skillicons.dev/icons?i=terraform" },
  { keywords: ["ansible"], url: "https://skillicons.dev/icons?i=ansible" },
  { keywords: ["nginx"], url: "https://skillicons.dev/icons?i=nginx" },
  { keywords: ["apache kafka", "kafka"], url: "https://skillicons.dev/icons?i=kafka" },
  { keywords: ["rabbitmq"], url: "https://skillicons.dev/icons?i=rabbitmq" },
  { keywords: ["prometheus"], url: "https://skillicons.dev/icons?i=prometheus" },
  { keywords: ["grafana"], url: "https://skillicons.dev/icons?i=grafana" },
  { keywords: ["github actions", "github-actions"], url: "https://skillicons.dev/icons?i=githubactions" },
  { keywords: ["jenkins"], url: "https://skillicons.dev/icons?i=jenkins" },
  { keywords: ["gitlab"], url: "https://skillicons.dev/icons?i=gitlab" },

  // Cloud Platforms
  { keywords: ["cloudflare"], url: "https://skillicons.dev/icons?i=cloudflare" },
  { keywords: ["vercel"], url: "https://skillicons.dev/icons?i=vercel" },
  { keywords: ["netlify"], url: "https://skillicons.dev/icons?i=netlify" },
  { keywords: ["heroku"], url: "https://skillicons.dev/icons?i=heroku" },
  { keywords: ["digitalocean", "digital ocean"], url: "https://skillicons.dev/icons?i=digitalocean" },

  // AWS Specific Services
  { keywords: ["lambda"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/awslambda.svg", invert: true },
  { keywords: ["s3", "simple storage"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazons3.svg", invert: true },
  { keywords: ["rds", "relational database"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonrds.svg", invert: true },
  { keywords: ["sqs", "simple queue"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonsqs.svg", invert: true },
  { keywords: ["sns", "simple notification"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonsns.svg", invert: true },
  { keywords: ["cloudfront"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazoncloudfront.svg", invert: true },
  { keywords: ["api gateway", "apigateway"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonapigateway.svg", invert: true },
  { keywords: ["route 53", "route53"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonroute53.svg", invert: true },
  { keywords: ["cognito"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazoncognito.svg", invert: true },
  { keywords: ["ecs", "elastic container service"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonecs.svg", invert: true },
  { keywords: ["ec2", "elastic compute cloud"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazonec2.svg", invert: true },
  { keywords: ["waf", "web application firewall"], url: "https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/amazoneks.svg", invert: true },
  { keywords: ["aws", "amazon"], url: "https://skillicons.dev/icons?i=aws" },

  // GCP / Google Cloud
  { keywords: ["google cloud platform", "google cloud", "gcp"], url: "https://skillicons.dev/icons?i=gcp" },

  // Azure
  { keywords: ["azure"], url: "https://skillicons.dev/icons?i=azure" },

  // AI & ML
  { keywords: ["openai", "chatgpt"], url: "https://skillicons.dev/icons?i=openai" },
  { keywords: ["hugging face", "huggingface"], url: "https://skillicons.dev/icons?i=huggingface" },
  { keywords: ["pytorch"], url: "https://skillicons.dev/icons?i=pytorch" },
  { keywords: ["tensorflow"], url: "https://skillicons.dev/icons?i=tensorflow" },
];

function getIconForTech(techName: string): IconMapItem | null {
  const normalized = techName.toLowerCase();
  
  for (const item of ICON_MAPPING) {
    for (const keyword of item.keywords) {
      if (keyword.length <= 4) {
        const regex = new RegExp(`\\b${keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
        if (regex.test(normalized)) {
          return item;
        }
      } else {
        if (normalized.includes(keyword)) {
          return item;
        }
      }
    }
  }
  return null;
}

function injectTechnologyIcons(chart: string): string {
  if (!chart) return "";

  const trimmed = chart.trim();
  const isFlowchart = /^(?:%%\s*.*\n)*\s*(graph|flowchart)\b/i.test(trimmed);
  if (!isFlowchart) {
    return chart;
  }

  const RESERVED_KEYWORDS = new Set([
    "graph", "flowchart", "subgraph", "end", "direction", 
    "style", "classdef", "class", "linkstyle", "click",
    "statediagram", "statediagram-v2", "erdiagram", "classdiagram",
    "sequencediagram", "gantt", "pie", "journey", "info", "requirementdiagram",
    "tb", "td", "bt", "rl", "lr"
  ]);

  const nodeRegex = /\b([a-zA-Z0-9_-]+)\s*(?:(\(\[|\[\(|\[\[|\(\(|\{\{|\[\/|\[\\|\[|\(|\{|\>))\s*("?)(.*?)\3\s*(?:(\]\)|\)\]|\]\]|\)\)|\}\}|\/\]|\\\]|\]|\)|\}))/g;

  return chart.replace(nodeRegex, (match, nodeId, openBrackets, quote, labelText, closeBrackets) => {
    if (RESERVED_KEYWORDS.has(nodeId.toLowerCase())) {
      return match;
    }

    const iconInfo = getIconForTech(labelText);
    if (iconInfo) {
      if (labelText.includes("<img")) {
        return match;
      }
      
      const filterStyle = iconInfo.invert ? "filter: invert(1) brightness(2);" : "";
      const imgTag = `<img src='${iconInfo.url}' width='20' height='20' style='vertical-align: middle; margin-right: 6px; display: inline-block; ${filterStyle}'/>`;
      
      return `${nodeId}${openBrackets}"${imgTag}${labelText.replace(/"/g, "'")}"${closeBrackets}`;
    }

    // Always wrap node label in double quotes to prevent syntax errors due to special characters/spaces
    return `${nodeId}${openBrackets}"${labelText.replace(/"/g, "'")}"${closeBrackets}`;
  });
}

function preprocessMermaidChart(chart: string): string {
  if (!chart || typeof chart !== "string") return "";

  let processed = injectTechnologyIcons(chart.trim());

  if (!processed.includes("erDiagram")) {
    return processed;
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

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFsDropdownOpen, setIsFsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fsDropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (fsDropdownRef.current && !fsDropdownRef.current.contains(e.target as Node)) {
        setIsFsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handleDownload = (format: "svg" | "png" | "pdf", activeContainerRef: React.RefObject<HTMLDivElement | null>) => {
    const svgElement = activeContainerRef.current?.querySelector("svg");
    if (!svgElement) return;

    const svgClone = svgElement.cloneNode(true) as SVGElement;
    const viewBox = svgElement.viewBox.baseVal;
    const width = viewBox.width || svgElement.clientWidth || 800;
    const height = viewBox.height || svgElement.clientHeight || 600;
    
    svgClone.setAttribute("width", width.toString());
    svgClone.setAttribute("height", height.toString());
    
    const svgString = new XMLSerializer().serializeToString(svgClone);

    if (format === "svg") {
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const blobURL = URL.createObjectURL(svgBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = blobURL;
      downloadLink.download = `diagram_${Date.now()}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobURL);
    } else if (format === "png") {
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * 2;
        canvas.height = height * 2;
        const context = canvas.getContext("2d");
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              const downloadLink = document.createElement("a");
              downloadLink.href = URL.createObjectURL(blob);
              downloadLink.download = `diagram_${Date.now()}.png`;
              document.body.appendChild(downloadLink);
              downloadLink.click();
              document.body.removeChild(downloadLink);
            }
            URL.revokeObjectURL(blobURL);
          }, "image/png");
        }
      };
      image.src = blobURL;
    } else if (format === "pdf") {
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("Please allow popups to export PDF.");
        return;
      }
      
      const styledSvg = svgClone.cloneNode(true) as SVGElement;
      styledSvg.setAttribute("width", "100%");
      styledSvg.setAttribute("height", "100%");
      styledSvg.style.maxWidth = "100%";
      styledSvg.style.maxHeight = "100%";
      const styledSvgString = new XMLSerializer().serializeToString(styledSvg);

      printWindow.document.write(`
        <html>
          <head>
            <title>Export PDF - System Diagram</title>
            <style>
              @page {
                size: landscape;
                margin: 10mm;
              }
              body {
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: #030712;
                color: #f5f5f0;
              }
              .container {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
              }
            </style>
          </head>
          <body>
            <div class="container">
              ${styledSvgString}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

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

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Download Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title="Download Diagram"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-36 rounded-xl border border-white/10 bg-slate-950/90 backdrop-blur-md shadow-2xl p-1 z-30">
                <button
                  type="button"
                  onClick={() => {
                    handleDownload("svg", containerRef);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-350 hover:text-white hover:bg-white/5 transition flex items-center gap-2 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>SVG Format (.svg)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownload("png", containerRef);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-350 hover:text-white hover:bg-white/5 transition flex items-center gap-2 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>PNG Image (.png)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownload("pdf", containerRef);
                    setIsDropdownOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-350 hover:text-white hover:bg-white/5 transition flex items-center gap-2 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span>PDF Document (.pdf)</span>
                </button>
              </div>
            )}
          </div>
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

              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* Fullscreen Download Dropdown */}
              <div className="relative" ref={fsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFsDropdownOpen(!isFsDropdownOpen)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                  title="Download Diagram"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                
                {isFsDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-36 rounded-xl border border-white/10 bg-slate-950/90 backdrop-blur-md shadow-2xl p-1 z-30">
                    <button
                      type="button"
                      onClick={() => {
                        handleDownload("svg", fullscreenContainerRef);
                        setIsFsDropdownOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-350 hover:text-white hover:bg-white/5 transition flex items-center gap-2 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span>SVG Format (.svg)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDownload("png", fullscreenContainerRef);
                        setIsFsDropdownOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-350 hover:text-white hover:bg-white/5 transition flex items-center gap-2 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>PNG Image (.png)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleDownload("pdf", fullscreenContainerRef);
                        setIsFsDropdownOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-slate-350 hover:text-white hover:bg-white/5 transition flex items-center gap-2 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span>PDF Document (.pdf)</span>
                    </button>
                  </div>
                )}
              </div>
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

