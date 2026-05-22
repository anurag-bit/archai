import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google";

type DesignPhase = "analysis" | "dataModel" | "architecture";

type Chunk = {
  index: number;
  text: string;
  score: number;
};

export type DesignResult = {
  projectSummary: string;
  assumptions: string[];
  openQuestions: string[];
  retrievalHighlights: string[];
  dataModelMarkdown: string;
  systemDesignMarkdown: string;
  selectedChunkCount: number;
  documentLength: number;
  generatedAt: string;
};

const MODEL_CANDIDATES = Array.from(
  new Set([
    process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
  ])
);
const MAX_CHUNK_SIZE = 2800;
const CHUNK_OVERLAP = 320;

const PHASE_KEYWORDS: Record<DesignPhase, string[]> = {
  analysis: [
    "goal",
    "objective",
    "user",
    "actor",
    "workflow",
    "feature",
    "requirement",
    "constraint",
    "permission",
    "notification",
    "integration",
    "admin",
    "report",
    "search",
    "upload",
    "approval",
  ],
  dataModel: [
    "entity",
    "record",
    "database",
    "table",
    "schema",
    "relationship",
    "transaction",
    "audit",
    "history",
    "status",
    "profile",
    "order",
    "invoice",
    "ticket",
    "course",
    "permission",
  ],
  architecture: [
    "api",
    "auth",
    "authentication",
    "authorization",
    "scale",
    "performance",
    "cache",
    "queue",
    "webhook",
    "deployment",
    "monitoring",
    "reliability",
    "latency",
    "availability",
    "integration",
    "security",
  ],
};

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitDocument(text: string): Chunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let buffer = "";

  function pushBuffer() {
    const cleaned = buffer.trim();
    if (!cleaned) {
      buffer = "";
      return;
    }

    const index = chunks.length;
    chunks.push({ index, text: cleaned, score: 0 });
    buffer = cleaned.slice(-CHUNK_OVERLAP);
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_SIZE) {
      if (buffer) {
        pushBuffer();
      }

      for (let start = 0; start < paragraph.length; start += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
        const slice = paragraph.slice(start, start + MAX_CHUNK_SIZE).trim();
        if (slice) {
          chunks.push({ index: chunks.length, text: slice, score: 0 });
        }
      }

      buffer = "";
      continue;
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_SIZE) {
      buffer = candidate;
    } else {
      pushBuffer();
      buffer = paragraph;
    }
  }

  pushBuffer();
  return chunks;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreChunk(text: string, keywords: string[]) {
  const lower = text.toLowerCase();

  return keywords.reduce((score, keyword) => {
    const pattern = new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, "g");
    const matches = lower.match(pattern);
    return score + (matches?.length ?? 0);
  }, 0);
}

function selectRelevantChunks(text: string, phase: DesignPhase) {
  const chunks = splitDocument(text);
  const keywords = PHASE_KEYWORDS[phase];

  const scored = chunks.map((chunk) => ({
    ...chunk,
    score:
      scoreChunk(chunk.text, keywords) +
      (chunk.index === 0 ? 4 : 0) +
      Math.min(2, Math.floor(chunk.text.length / 1200)),
  }));

  return scored
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    })
    .slice(0, Math.min(8, scored.length));
}

function buildContext(text: string, phase: DesignPhase) {
  const selectedChunks = selectRelevantChunks(text, phase);
  const context = selectedChunks
    .map(
      (chunk, position) =>
        `[[Chunk ${position + 1} | source ${chunk.index + 1} | score ${chunk.score}]]\n${chunk.text}`
    )
    .join("\n\n---\n\n");

  return {
    context,
    selectedChunks,
  };
}

function createModel(model: string, options?: { thinkingBudget?: number; temperature?: number }) {
  return new ChatGoogle({
    model,
    temperature: options?.temperature ?? 0.2,
    apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    ...(options?.thinkingBudget ? { thinkingBudget: options.thinkingBudget } : {}),
  });
}

function isRetryableModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /quota exceeded|rate limit|please retry|service unavailable/i.test(message);
}

async function invokeWithFallback(
  messages: Array<SystemMessage | HumanMessage>,
  options?: { thinkingBudget?: number; temperature?: number }
) {
  let lastError: unknown;

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = createModel(modelName, options);
      return await model.invoke(messages);
    } catch (error) {
      lastError = error;

      if (!isRetryableModelError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The Gemini models returned a retryable error.");
}

function contentToText(content: unknown) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text?: unknown }).text ?? "");
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return String(content ?? "").trim();
}

function extractBullets(markdown: string, heading: string) {
  const headingPattern = new RegExp(
    `^#{1,3}\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^#{1,3}\\s+|\\Z)`,
    "im"
  );
  const section = markdown.match(headingPattern)?.[1] ?? markdown;

  return section
    .split("\n")
    .map((line) => line.replace(/^[\s>*-]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);
}

function compactSummary(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.slice(0, 2).join(" ") || text.slice(0, 220);
}

function detectDomainHints(text: string) {
  const lower = text.toLowerCase();

  const hints = [
    ["support/ticketing", /ticket|support|issue|help desk|sla/],
    ["marketplace/e-commerce", /order|catalog|cart|checkout|vendor|product|inventory/],
    ["learning platform", /course|student|instructor|quiz|lesson|enrollment/],
    ["project/work management", /project|task|kanban|workflow|assignee|comment/],
    ["messaging/notification", /notification|message|alert|email|sms|push/],
  ] as const;

  return hints
    .filter(([, pattern]) => pattern.test(lower))
    .map(([label]) => label);
}

function generateFallbackDesign(documentText: string): DesignResult {
  const normalized = normalizeText(documentText);
  const architectureContext = buildContext(normalized, "architecture");
  const domainHints = detectDomainHints(normalized);
  const summary = compactSummary(normalized);

  return {
    projectSummary:
      summary ||
      "The document describes a product that should be decomposed into users, services, storage, and integrations.",
    assumptions: [
      domainHints.length > 0
        ? `The product is closest to: ${domainHints.join(", ")}.`
        : "The product is a standard web application with authenticated users.",
      "The system needs a relational database for core business data.",
      "Notifications and auditability should be handled asynchronously where possible.",
    ],
    openQuestions: [
      "What are the expected traffic, latency, and availability targets?",
      "Which external integrations are required for the first release?",
      "Should the product support multi-tenancy, role-based access, or SSO?",
    ],
    retrievalHighlights: architectureContext.selectedChunks.map((chunk) => {
      const snippet = chunk.text.replace(/\s+/g, " ").slice(0, 220);
      return `Chunk ${chunk.index + 1} | score ${chunk.score}: ${snippet}${chunk.text.length > 220 ? "..." : ""}`;
    }),
    dataModelMarkdown: [
      "## Entities",
      "- User",
      "- Primary business object (project/order/ticket/course depending on the domain)",
      "- Activity or event log",
      "- Notification",
      "- Attachment or comment",
      "",
      "## PostgreSQL sketch",
      "```sql",
      "create table users (",
      "  id uuid primary key,",
      "  email text not null unique,",
      "  name text not null,",
      "  role text not null default 'member',",
      "  created_at timestamptz not null default now(),",
      "  updated_at timestamptz not null default now()",
      ");",
      "",
      "create table notifications (",
      "  id uuid primary key,",
      "  user_id uuid not null references users(id),",
      "  channel text not null,",
      "  status text not null default 'queued',",
      "  payload jsonb not null default '{}'::jsonb,",
      "  created_at timestamptz not null default now()",
      ");",
      "```",
    ].join("\n"),
    systemDesignMarkdown: [
      "## Overview",
      "Use a three-layer design: UI, API/application services, and persistent storage. Keep notifications and background work off the request path.",
      "",
      "## High-level architecture",
      "```mermaid",
      "flowchart LR",
      "  User[End User] --> UI[Web App]",
      "  UI --> API[API Layer]",
      "  API --> DB[(PostgreSQL)]",
      "  API --> Q[(Job Queue)]",
      "  Q --> Worker[Background Worker]",
      "  Worker --> Notify[Email/SMS/Push Provider]",
      "```",
      "",
      "## API surface",
      "- POST /api/<resource>: create core objects",
      "- PATCH /api/<resource>/:id: update status and metadata",
      "- GET /api/<resource>: list and filter records",
      "- GET /api/audit: query history and change logs",
      "",
      "## Scaling strategy",
      "Add caching for read-heavy endpoints, split background processing from user requests, and introduce read replicas once write volume increases.",
      "",
      "## Request flow",
      "```mermaid",
      "sequenceDiagram",
      "  participant U as User",
      "  participant W as Web App",
      "  participant A as API",
      "  participant D as DB",
      "  participant B as Worker",
      "  U->>W: Submit request",
      "  W->>A: POST payload",
      "  A->>D: Persist core record",
      "  A-->>W: Return confirmation",
      "  A->>B: Enqueue notifications / side effects",
      "```",
    ].join("\n"),
    selectedChunkCount: architectureContext.selectedChunks.length,
    documentLength: normalized.length,
    generatedAt: new Date().toISOString(),
  };
}

async function generateSection(
  phase: DesignPhase,
  documentText: string,
  previousSections: string
) {
  const { context } = buildContext(documentText, phase);
  const systemPrompt =
    phase === "analysis"
      ? "You are a senior product analyst. Convert the requirements into a concise architecture brief. Return Markdown with the headings: Product intent, Actors, Functional requirements, Non-functional requirements, Assumptions, and Open questions. Do not invent missing requirements."
      : phase === "dataModel"
        ? "You are a principal database architect. Design a normalized PostgreSQL schema from the requirements and the analysis brief. Return Markdown with a SQL DDL section, key entities, relationships, indexes, and implementation notes. Be precise about constraints and timestamps."
        : "You are a principal software architect. Produce a full system design document in Markdown. Include Overview, Service decomposition, API surface, Data flow, Scaling strategy, Security, Observability, Deployment, and at least one Mermaid diagram for the architecture and one for a key request flow.";

  const userPrompt =
    phase === "analysis"
      ? `Requirements document:\n\n${context}`
      : phase === "dataModel"
        ? `Requirements document:\n\n${context}\n\nArchitecture brief:\n\n${previousSections}`
        : `Requirements document:\n\n${context}\n\nArchitecture brief:\n\n${previousSections}`;

  const response = await invokeWithFallback(
    [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
    {
      thinkingBudget: phase === "architecture" ? 1024 : undefined,
      temperature: phase === "analysis" ? 0.15 : 0.2,
    }
  );

  return contentToText(response.content);
}

export async function generateSystemDesign(documentText: string): Promise<DesignResult> {
  const normalized = normalizeText(documentText);

  try {
    const analysisMarkdown = await generateSection("analysis", normalized, "");
    const dataModelMarkdown = await generateSection("dataModel", normalized, analysisMarkdown);
    const systemDesignMarkdown = await generateSection(
      "architecture",
      normalized,
      `${analysisMarkdown}\n\n${dataModelMarkdown}`
    );

    const assumptions = extractBullets(analysisMarkdown, "Assumptions");
    const openQuestions = extractBullets(analysisMarkdown, "Open questions");
    const projectSummary = extractBullets(analysisMarkdown, "Product intent").join(" ");
    const architectureContext = buildContext(normalized, "architecture");

    return {
      projectSummary: projectSummary || "The document was analyzed into a multi-stage system design draft.",
      assumptions: assumptions.length > 0 ? assumptions : ["No explicit assumptions were returned by the model."],
      openQuestions: openQuestions.length > 0 ? openQuestions : ["No open questions were returned by the model."],
      retrievalHighlights: architectureContext.selectedChunks.map((chunk) => {
        const snippet = chunk.text.replace(/\s+/g, " ").slice(0, 220);
        return `Chunk ${chunk.index + 1} | score ${chunk.score}: ${snippet}${chunk.text.length > 220 ? "..." : ""}`;
      }),
      dataModelMarkdown,
      systemDesignMarkdown,
      selectedChunkCount: architectureContext.selectedChunks.length,
      documentLength: normalized.length,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return generateFallbackDesign(normalized);
  }
}