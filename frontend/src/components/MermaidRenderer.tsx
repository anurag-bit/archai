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
      primaryColor: "#27272A", // Surface Dark (#27272A)
      primaryTextColor: "#FAFAFA", // Text Dark (#FAFAFA)
      lineColor: "#4B5563", // Primary Light / Line Color (#4B5563)
      primaryBorderColor: "#38BDF8", // Accent Dark (#38BDF8)
      nodeBorder: "#3F3F46", // subtle border contrast
      mainBkg: "#18181B", // Background Dark (#18181B)
      actorBkg: "#27272A", // Surface Dark (#27272A)
      actorBorder: "#3F3F46",
      signalColor: "#38BDF8", // Accent Dark (#38BDF8)
      signalLineColor: "#4B5563",
      cardinalityStroke: "#4B5563",
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
  { keywords: ["next.js", "nextjs"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/next.svg", invert: true },
  { keywords: ["react"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/react.svg",invert:true },
  { keywords: ["vue"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/vue.svg",invert:true },
  { keywords: ["angular"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/angular.svg", invert:true },
  { keywords: ["svelte"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/svelte.svg", invert:true },
  { keywords: ["fastapi"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/fastapi.svg", invert:true },
  { keywords: ["django"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/django.svg", invert:true },
  { keywords: ["flask"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/flask.svg", invert: true },
  { keywords: ["express"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/express.svg", invert: true },
  { keywords: ["nestjs", "nest.js"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/nest.svg" },
  { keywords: ["spring boot", "springboot"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/springboot.svg", invert:true  },
  { keywords: ["spring framework", "spring"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/spring.svg", invert:true },
  { keywords: ["laravel"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/laravel.svg", invert:true },
  { keywords: ["flutter"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/flutter.svg", invert:true },

  // Databases & Caches
  { keywords: ["postgresql", "postgres"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/postgres.svg", invert: true },
  { keywords: ["redis"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/redis.svg", invert: true },
  { keywords: ["mysql"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/mysql.svg", invert:true        },
  { keywords: ["mongodb", "mongo"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/mongodb.svg", invert:true },
  { keywords: ["sqlite"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/sqlite.svg", invert:true },
  { keywords: ["cassandra"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/cassandra.svg", invert:true },
  { keywords: ["dynamodb"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-dynamodb.svg", invert:true },
  { keywords: ["elasticsearch", "opensearch"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/elasticsearch.svg", invert:true },
  { keywords: ["supabase"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/supabase.svg", invert:true },
  { keywords: ["firebase"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/firebase.svg", invert:true },
  { keywords: ["prisma"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/prisma.svg", invert: true },

  // Languages & Runtimes
  { keywords: ["nodejs", "node.js", "node run"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/node.svg", invert:true },
  { keywords: ["python"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/python.svg", invert:true },
  { keywords: ["golang", "go lang"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/go.svg", invert:true },
  { keywords: ["rust"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/rust.svg", invert: true },
  { keywords: ["java "], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/java.svg", invert:true },
  { keywords: ["typescript", "ts"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/typescript.svg", invert:true },
  { keywords: ["javascript", "js"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/javascript.svg", invert:true },
  { keywords: ["cpp", "c++"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/cpp.svg", invert:true },
  { keywords: ["ruby"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/ruby.svg", invert:true },
  { keywords: ["php"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/php.svg", invert:true },
  { keywords: ["elixir"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/elixir.svg", invert:true },
  { keywords: ["swift"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/swift.svg", invert:true },
  { keywords: ["kotlin"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/kotlin.svg", invert:true },

  // DevOps & Server
  { keywords: ["docker"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/docker.svg" },
  { keywords: ["kubernetes", "k8s", "eks", "gke", "aks"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/k8s-kubernetes.svg", invert:true  },
  { keywords: ["terraform"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/terraform.svg" },
  { keywords: ["ansible"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/ansible.svg", invert: true },
  { keywords: ["nginx"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/nginx.svg" },
  { keywords: ["apache kafka", "kafka"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/kafka.svg", invert: true },
  { keywords: ["rabbitmq"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/rabbitmq.svg" },
  { keywords: ["prometheus"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/prometheus.svg" },
  { keywords: ["grafana"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/grafana.svg" },
  { keywords: ["github actions", "github-actions"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/github-actions.svg", invert: true },
  { keywords: ["jenkins"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/jenkins.svg" },
  { keywords: ["gitlab"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/gitlab.svg" },

  // Cloud Platforms
  { keywords: ["cloudflare"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/cloudflare.svg" },
  { keywords: ["vercel"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/vercel.svg", invert: true },
  { keywords: ["netlify"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/netlify.svg" },
  { keywords: ["heroku"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/heroku.svg" },
  { keywords: ["digitalocean", "digital ocean"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/digitalocean.svg" },

  // AWS Specific Services
  { keywords: ["lambda"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-lambda.svg" },
  { keywords: ["s3", "simple storage"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-simple-storage-service.svg" },
  { keywords: ["rds", "relational database"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-rds.svg" },
  { keywords: ["sqs", "simple queue"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-simple-queue-service.svg" },
  { keywords: ["sns", "simple notification"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-simple-notification-service.svg" },
  { keywords: ["cloudfront"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-cloudfront.svg" },
  { keywords: ["api gateway", "apigateway"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-api-gateway.svg" },
  { keywords: ["route 53", "route53"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-route-53.svg" },
  { keywords: ["cognito"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-cognito.svg" },
  { keywords: ["ecs", "elastic container service"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-elastic-container-service.svg" },
  { keywords: ["ec2", "elastic compute cloud"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-ec2.svg" },
  { keywords: ["waf", "web application firewall"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws-waf.svg" },
  { keywords: ["aws", "amazon"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/aws.svg", invert: true },

  // GCP / Google Cloud
  { keywords: ["google cloud platform", "google cloud", "gcp"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/google-cloud.svg" },

  // Azure
  { keywords: ["azure"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/azure.svg" },

  // AI & ML
  { keywords: ["openai", "chatgpt"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/openai.svg", invert: true },
  { keywords: ["hugging face", "huggingface"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/hugging-face.svg" },
  { keywords: ["pytorch"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/pytorch.svg" },
  { keywords: ["tensorflow"], url: "https://storage.googleapis.com/eraser-public-assets/canvas-icons/tensorflow.svg" },
];

function isDarkTheme(): boolean {
  if (typeof window === "undefined") return true;
  const hasDarkClass = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const hasLightClass = document.documentElement.classList.contains("light") || document.body.classList.contains("light");
  
  if (hasLightClass) return false;
  if (hasDarkClass) return true;
  return prefersDark || true; // Default to true since the platform is dark theme
}

function reinitializeMermaid() {
  const isDark = isDarkTheme();
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "loose",
    themeVariables: isDark ? {
      primaryColor: "#27272A",
      primaryTextColor: "#FAFAFA",
      lineColor: "#4B5563",
      primaryBorderColor: "#38BDF8",
      nodeBorder: "#3F3F46",
      mainBkg: "#18181B",
      actorBkg: "#27272A",
      actorBorder: "#3F3F46",
      signalColor: "#38BDF8",
      signalLineColor: "#4B5563",
      cardinalityStroke: "#4B5563",
    } : {
      primaryColor: "#FFFFFF",
      primaryTextColor: "#18181B",
      lineColor: "#D1D5DB",
      primaryBorderColor: "#0EA5E9",
      nodeBorder: "#E5E7EB",
      mainBkg: "#FCFCFC",
      actorBkg: "#FFFFFF",
      actorBorder: "#D1D5DB",
      signalColor: "#0EA5E9",
      signalLineColor: "#D1D5DB",
      cardinalityStroke: "#D1D5DB",
    },
  });
}

interface PathCommand {
  type: string;
  args: number[];
}

function parsePathD(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const commandRegex = /([mlhvcsqtaz])/ig;
  const parts = d.split(commandRegex);
  
  const numRegex = /[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
  for (let i = 1; i < parts.length; i += 2) {
    const type = parts[i];
    const argsStr = parts[i + 1];
    
    const args: number[] = [];
    if (argsStr) {
      let match;
      while ((match = numRegex.exec(argsStr)) !== null) {
        args.push(parseFloat(match[0]));
      }
    }
    commands.push({ type, args });
  }
  return commands;
}

function stringifyPathD(commands: PathCommand[]): string {
  return commands.map(c => c.type + " " + c.args.join(" ")).join(" ");
}

function parseNodeId(nodeEl: Element): string | null {
  const dataId = nodeEl.getAttribute('data-id');
  if (dataId) return dataId;
  
  const idAttr = nodeEl.getAttribute('id');
  if (idAttr) {
    const parts = idAttr.split('-');
    if (parts.length >= 2) {
      let extracted = parts.slice(1);
      if (extracted.length > 1 && !isNaN(Number(extracted[extracted.length - 1]))) {
        extracted = extracted.slice(0, -1);
      }
      return extracted.join('-');
    }
    return idAttr;
  }
  return null;
}

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

  const EXPECTED_CLOSE: Record<string, string> = {
    "[": "]",
    "(": ")",
    "[(": ")]",
    "([": "])",
    "[[": "]]",
    "((": "))",
    "{{": "}}",
    "[\\": "/]",
    "[/": "\\",
    ">": "]",
    "{": "}"
  };

  const nodeRegex = /\b([a-zA-Z0-9_-]+)\s*(?:(\(\[|\[\(|\[\[|\(\(|\{\{|\[\/|\[\\|\[|\(|\{|\>))\s*("?)(.*?)\3\s*(?:(\]\)|\)\]|\]\]|\)\)|\}\}|\/\]|\\\]|\]|\)|\}))/g;

  const lines = chart.split("\n");
  const processedLines = lines.map(line => {
    const trimmedLine = line.trim();
    const lowerLine = trimmedLine.toLowerCase();

    // Ignore lines that setup boundaries, subgraphs, styling, or link styles
    if (
      lowerLine.startsWith("subgraph") ||
      lowerLine.startsWith("style") ||
      lowerLine.startsWith("classdef") ||
      lowerLine.startsWith("linkstyle")
    ) {
      return line;
    }

    return line.replace(nodeRegex, (match, nodeId, openBrackets, quote, labelText, closeBrackets) => {
      if (RESERVED_KEYWORDS.has(nodeId.toLowerCase())) {
        return match;
      }

      // Handle mismatched brackets from greedy/non-greedy regex matching (e.g. matching ']' vs ')]')
      let finalLabel = labelText;
      let finalClose = closeBrackets;
      const expectedClose = EXPECTED_CLOSE[openBrackets];
      if (expectedClose && closeBrackets !== expectedClose) {
        if (closeBrackets.endsWith(expectedClose)) {
          const extra = closeBrackets.slice(0, -expectedClose.length);
          finalLabel = labelText + extra;
          finalClose = expectedClose;
        } else {
          return match;
        }
      }

      const iconInfo = getIconForTech(finalLabel);
      if (iconInfo) {
        if (finalLabel.includes("<img")) {
          return match;
        }
        
        const shouldInvert = iconInfo.invert && isDarkTheme();
        const filterStyle = shouldInvert ? "filter: invert(1) brightness(2);" : "";
        const imgTag = `<img src='${iconInfo.url}' width='20' height='20' style='vertical-align: middle; margin-right: 6px; display: inline-block; ${filterStyle}'/>`;
        
        return `${nodeId}${openBrackets}"${imgTag}${finalLabel.replace(/"/g, "'")}"${finalClose}`;
      }

      // Always wrap node label in double quotes to prevent syntax errors due to special characters/spaces
      return `${nodeId}${openBrackets}"${finalLabel.replace(/"/g, "'")}"${finalClose}`;
    });
  });

  return processedLines.join("\n");
}

function preprocessMermaidChart(chart: string): string {
  if (!chart || typeof chart !== "string") return "";

  // Fix common LLM shape typos: DB[((Database Store: PostgreSQL)]) -> DB[(Database Store: PostgreSQL)]
  const cleaned = chart.replace(/\[\(\(+/g, "[(").replace(/\)\]\)+/g, ")]");

  // Wrap arrow labels containing curly braces or parentheses in double quotes to prevent syntax errors
  const labelRegex = /\|([^|\r\n]+)\|/g;
  const withQuotes = cleaned.replace(labelRegex, (match, label) => {
    const trimmed = label.trim();
    if ((trimmed.includes("{") || trimmed.includes("}") || trimmed.includes("(") || trimmed.includes(")")) && 
        !(trimmed.startsWith('"') && trimmed.endsWith('"')) &&
        !(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return `|"${trimmed.replace(/"/g, '\\"')}"|`;
    }
    return match;
  });

  let processed = injectTechnologyIcons(withQuotes.trim());

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

let renderQueue = Promise.resolve<any>(null);

async function serializedRender(id: string, text: string): Promise<{ svg: string }> {
  const currentQueue = renderQueue;
  const nextRender = (async () => {
    try {
      await currentQueue;
    } catch (e) {
      // Ignore previous errors to keep queue moving
    }
    return mermaid.render(id, text);
  })();
  renderQueue = nextRender;
  return nextRender;
}

export function MermaidRenderer({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenViewportRef = useRef<HTMLDivElement>(null);

  const nodeDragRef = useRef<{
    element: SVGGElement;
    nodeId: string;
    startX: number;
    startY: number;
    initialTransformX: number;
    initialTransformY: number;
    startPaths: Array<{ path: SVGPathElement; originalCommands: PathCommand[] }>;
    endPaths: Array<{ path: SVGPathElement; originalCommands: PathCommand[] }>;
  } | null>(null);

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

  const [themeSeq, setThemeSeq] = useState(0);
  useEffect(() => {
    const handleThemeChange = () => {
      setThemeSeq(prev => prev + 1);
    };
    window.addEventListener("theme-change", handleThemeChange);
    return () => window.removeEventListener("theme-change", handleThemeChange);
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
        reinitializeMermaid();
        const cleanChart = preprocessMermaidChart(chart);
        const renderId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await serializedRender(renderId, cleanChart);
        
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
        const badElement = document.getElementById(`d${renderId}`);
        if (badElement) {
          badElement.remove();
        }
      }
    };

    renderChart();

    return () => {
      active = false;
    };
  }, [chart, themeSeq]);

  // Fullscreen render
  useEffect(() => {
    let active = true;
    if (!isFullscreen || !fullscreenContainerRef.current || !chart) return;

    const renderFullscreenChart = async () => {
      try {
        reinitializeMermaid();
        const cleanChart = preprocessMermaidChart(chart);
        const renderId = `mermaid-fs-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await serializedRender(renderId, cleanChart);
        
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
  }, [isFullscreen, chart, svgDimensions, themeSeq]);

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
    
    const nodeEl = (e.target as Element).closest(".node") as SVGGElement | null;
    if (nodeEl) {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      
      const id = nodeEl.getAttribute('id') || '';
      const dataId = nodeEl.getAttribute('data-id') || '';
      const parsedId = parseNodeId(nodeEl);
      
      const startSelectors = [];
      if (id) startSelectors.push(`.LS-${id}`);
      if (dataId) startSelectors.push(`.LS-${dataId}`);
      if (parsedId && parsedId !== id && parsedId !== dataId) {
        startSelectors.push(`.LS-${parsedId}`);
      }
      
      const endSelectors = [];
      if (id) endSelectors.push(`.LE-${id}`);
      if (dataId) endSelectors.push(`.LE-${dataId}`);
      if (parsedId && parsedId !== id && parsedId !== dataId) {
        endSelectors.push(`.LE-${parsedId}`);
      }
      
      const transformAttr = nodeEl.getAttribute("transform") || "";
      const match = transformAttr.match(/translate\(([-\d\.]+)\s*,\s*([-\d\.]+)\)/);
      let initialTransformX = 0;
      let initialTransformY = 0;
      if (match) {
        initialTransformX = parseFloat(match[1]);
        initialTransformY = parseFloat(match[2]);
      }
      
      const activeContainer = containerRef.current;
      const startPathEls = startSelectors.length > 0
        ? activeContainer?.querySelectorAll(startSelectors.join(', ')) || []
        : [];
      const endPathEls = endSelectors.length > 0
        ? activeContainer?.querySelectorAll(endSelectors.join(', ')) || []
        : [];
      
      const startPaths = Array.from(startPathEls).map(el => {
        const path = el.querySelector('path') || el;
        const d = path.getAttribute('d') || '';
        return { path: path as SVGPathElement, originalCommands: parsePathD(d) };
      });
      const endPaths = Array.from(endPathEls).map(el => {
        const path = el.querySelector('path') || el;
        const d = path.getAttribute('d') || '';
        return { path: path as SVGPathElement, originalCommands: parsePathD(d) };
      });
      
      nodeDragRef.current = {
        element: nodeEl,
        nodeId: dataId || id || parsedId || "",
        startX: e.clientX,
        startY: e.clientY,
        initialTransformX,
        initialTransformY,
        startPaths,
        endPaths,
      };
      return;
    }

    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) {
      const dragInfo = nodeDragRef.current;
      const scale = transform.scale;
      const dx = (e.clientX - dragInfo.startX) / scale;
      const dy = (e.clientY - dragInfo.startY) / scale;
      
      const newX = dragInfo.initialTransformX + dx;
      const newY = dragInfo.initialTransformY + dy;
      dragInfo.element.setAttribute("transform", `translate(${newX}, ${newY})`);
      
      // Update starting edges
      for (const edge of dragInfo.startPaths) {
        const commands = JSON.parse(JSON.stringify(edge.originalCommands)) as PathCommand[];
        if (commands.length > 0) {
          commands[0].args[0] += dx;
          commands[0].args[1] += dy;
          if (commands.length > 1 && ["c", "q", "s", "t"].includes(commands[1].type.toLowerCase())) {
            commands[1].args[0] += dx;
            commands[1].args[1] += dy;
          }
          edge.path.setAttribute("d", stringifyPathD(commands));
        }
      }
      
      // Update ending edges
      for (const edge of dragInfo.endPaths) {
        const commands = JSON.parse(JSON.stringify(edge.originalCommands)) as PathCommand[];
        if (commands.length > 0) {
          const last = commands[commands.length - 1];
          const len = last.args.length;
          if (len >= 2) {
            last.args[len - 2] += dx;
            last.args[len - 1] += dy;
          }
          if (last.type.toLowerCase() === "c" && len >= 6) {
            last.args[2] += dx;
            last.args[3] += dy;
          } else if (last.type.toLowerCase() === "s" && len >= 4) {
            last.args[0] += dx;
            last.args[1] += dy;
          }
          edge.path.setAttribute("d", stringifyPathD(commands));
        }
      }
      return;
    }

    if (!isDragging) return;
    setTransform({
      scale: transform.scale,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) {
      nodeDragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
    
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
    
    const nodeEl = (e.target as Element).closest(".node") as SVGGElement | null;
    if (nodeEl) {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      
      const id = nodeEl.getAttribute('id') || '';
      const dataId = nodeEl.getAttribute('data-id') || '';
      const parsedId = parseNodeId(nodeEl);
      
      const startSelectors = [];
      if (id) startSelectors.push(`.LS-${id}`);
      if (dataId) startSelectors.push(`.LS-${dataId}`);
      if (parsedId && parsedId !== id && parsedId !== dataId) {
        startSelectors.push(`.LS-${parsedId}`);
      }
      
      const endSelectors = [];
      if (id) endSelectors.push(`.LE-${id}`);
      if (dataId) endSelectors.push(`.LE-${dataId}`);
      if (parsedId && parsedId !== id && parsedId !== dataId) {
        endSelectors.push(`.LE-${parsedId}`);
      }
      
      const transformAttr = nodeEl.getAttribute("transform") || "";
      const match = transformAttr.match(/translate\(([-\d\.]+)\s*,\s*([-\d\.]+)\)/);
      let initialTransformX = 0;
      let initialTransformY = 0;
      if (match) {
        initialTransformX = parseFloat(match[1]);
        initialTransformY = parseFloat(match[2]);
      }
      
      const activeContainer = fullscreenContainerRef.current;
      const startPathEls = startSelectors.length > 0
        ? activeContainer?.querySelectorAll(startSelectors.join(', ')) || []
        : [];
      const endPathEls = endSelectors.length > 0
        ? activeContainer?.querySelectorAll(endSelectors.join(', ')) || []
        : [];
      
      const startPaths = Array.from(startPathEls).map(el => {
        const path = el.querySelector('path') || el;
        const d = path.getAttribute('d') || '';
        return { path: path as SVGPathElement, originalCommands: parsePathD(d) };
      });
      const endPaths = Array.from(endPathEls).map(el => {
        const path = el.querySelector('path') || el;
        const d = path.getAttribute('d') || '';
        return { path: path as SVGPathElement, originalCommands: parsePathD(d) };
      });
      
      nodeDragRef.current = {
        element: nodeEl,
        nodeId: dataId || id || parsedId || "",
        startX: e.clientX,
        startY: e.clientY,
        initialTransformX,
        initialTransformY,
        startPaths,
        endPaths,
      };
      return;
    }

    setIsFsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setFsDragStart({ x: e.clientX - fullscreenTransform.x, y: e.clientY - fullscreenTransform.y });
  };

  const handleFsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) {
      const dragInfo = nodeDragRef.current;
      const scale = fullscreenTransform.scale;
      const dx = (e.clientX - dragInfo.startX) / scale;
      const dy = (e.clientY - dragInfo.startY) / scale;
      
      const newX = dragInfo.initialTransformX + dx;
      const newY = dragInfo.initialTransformY + dy;
      dragInfo.element.setAttribute("transform", `translate(${newX}, ${newY})`);
      
      // Update starting edges
      for (const edge of dragInfo.startPaths) {
        const commands = JSON.parse(JSON.stringify(edge.originalCommands)) as PathCommand[];
        if (commands.length > 0) {
          commands[0].args[0] += dx;
          commands[0].args[1] += dy;
          if (commands.length > 1 && ["c", "q", "s", "t"].includes(commands[1].type.toLowerCase())) {
            commands[1].args[0] += dx;
            commands[1].args[1] += dy;
          }
          edge.path.setAttribute("d", stringifyPathD(commands));
        }
      }
      
      // Update ending edges
      for (const edge of dragInfo.endPaths) {
        const commands = JSON.parse(JSON.stringify(edge.originalCommands)) as PathCommand[];
        if (commands.length > 0) {
          const last = commands[commands.length - 1];
          const len = last.args.length;
          if (len >= 2) {
            last.args[len - 2] += dx;
            last.args[len - 1] += dy;
          }
          if (last.type.toLowerCase() === "c" && len >= 6) {
            last.args[2] += dx;
            last.args[3] += dy;
          } else if (last.type.toLowerCase() === "s" && len >= 4) {
            last.args[0] += dx;
            last.args[1] += dy;
          }
          edge.path.setAttribute("d", stringifyPathD(commands));
        }
      }
      return;
    }

    if (!isFsDragging) return;
    setFullscreenTransform({
      scale: fullscreenTransform.scale,
      x: e.clientX - fsDragStart.x,
      y: e.clientY - fsDragStart.y,
    });
  };

  const handleFsPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (nodeDragRef.current) {
      nodeDragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
    
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

