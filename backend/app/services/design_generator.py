"""
design_generator.py — Archai Agency (LangGraph Multi-Agent System)

Architecture
============
The pipeline is a LangGraph StateGraph with six nodes that run
sequentially, one module at a time:

  extractor_node  →  fetch_context_node  →  dba_agent_node
      ↑                                          ↓
      │                                    qa_agent_node
      │                                    (PASS → api_agent_node)
      │                                    (FAIL → dba_agent_node, max 3 retries)
      │                                          ↓
      └──────────────── save_and_iterate_node ←──┘
                        (more modules → fetch_context_node)
                        (done         → END)

Agents
------
• Schema Architect Agent (DBA)  — designs tables, ERD, business rules
• Compliance Agent (QA)         — audits the draft; outputs PASS or structured feedback
• API Engineer Agent            — designs endpoints + state-machine workflows
"""

import os
import re
import time
import uuid
import hashlib
import json
from typing import List, Dict, Any, Optional, Annotated, Sequence
from typing_extensions import TypedDict

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from services.vector_store import (
    index_chunks_to_chroma,
    query_chroma_for_chunks,
    clear_chroma_chunks,
)

# ─────────────────────────── constants ───────────────────────────────────────
MAX_CHUNK_SIZE = int(os.getenv("MAX_CHUNK_SIZE", "2800"))
CHUNK_OVERLAP  = int(os.getenv("CHUNK_OVERLAP", "320"))
MAX_QA_RETRIES = int(os.getenv("MAX_QA_RETRIES", "3"))

# ─────────────────────────── GraphState ──────────────────────────────────────

class GraphState(TypedDict):
    # ── inputs ────────────────────────────────────────────────────────────────
    normalized_text: str          # full SRS text (normalised)
    document_id:     str          # SHA-256 fingerprint of doc
    request_id:      str          # UUID for this run (ties Chroma records)

    # ── module iteration ──────────────────────────────────────────────────────
    modules:         List[str]    # all modules extracted in Phase 0
    module_index:    int          # current position in `modules`

    # ── per-module working state ───────────────────────────────────────────────
    current_module:  str          # name of the module being processed
    module_context:  str          # Chroma-retrieved context for current module
    module_chunks:   List[Dict[str, Any]]  # raw chunks for this module

    dba_draft:       Dict[str, Any]        # JSON output from DBA agent
    qa_feedback:     str                   # "PASS" or structured feedback text
    qa_retries:      int                   # retry counter for QA→DBA loop

    api_design:      Dict[str, Any]        # JSON output from API agent

    # ── accumulator ───────────────────────────────────────────────────────────
    domain_designs:  List[Dict[str, Any]]  # finished per-module designs

    # ── architecture constraints (user-supplied, threaded through every agent) ─
    tech_stack:          str   # e.g. "PostgreSQL, FastAPI, Redis"
    design_principles:   str   # e.g. "CQRS, Event Sourcing"
    security_protocols:  str   # e.g. "Row-Level Security, AES-256 at rest"

# ─────────────────────────── helpers ─────────────────────────────────────────

def get_chat_model(temperature: float = 0.0) -> ChatOpenAI:
    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    api_key    = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    return ChatOpenAI(
        model=model_name,
        temperature=temperature,
        openai_api_key=api_key,
        request_timeout=120,
    )


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def generate_document_id(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]


def parse_llm_json(content: str) -> Dict[str, Any]:
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    try:
        return json.loads(content.strip())
    except json.JSONDecodeError:
        return {"raw": content}


def format_chunks_as_context(chunks: List[Dict[str, Any]]) -> str:
    parts = []
    for pos, chunk in enumerate(chunks):
        parts.append(
            f"[[Chunk {pos + 1} | source {chunk['index'] + 1} | score {chunk['score']}]]\n"
            f"{chunk['text']}"
        )
    return "\n\n---\n\n".join(parts)


def compact_summary(text: str) -> str:
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    return " ".join(sentences[:2]) if sentences else text[:220]


def detect_domain_hints(text: str) -> List[str]:
    lower = text.lower()
    hints = [
        ("support/ticketing",      re.compile(r'ticket|support|issue|help desk|sla')),
        ("marketplace/e-commerce", re.compile(r'order|catalog|cart|checkout|vendor|product|inventory')),
        ("learning platform",      re.compile(r'course|student|instructor|quiz|lesson|enrollment')),
        ("project/work management",re.compile(r'project|task|kanban|workflow|assignee|comment')),
        ("messaging/notification", re.compile(r'notification|message|alert|email|sms|push')),
    ]
    return [label for label, pattern in hints if pattern.search(lower)]

# ─────────────────────────── QA loop-break helpers ────────────────────────────

def _text_similarity(text1: str, text2: str) -> float:
    """
    Jaccard word-level similarity between two text blocks (0.0–1.0).
    Used to detect when QA is repeating the same feedback across retries.
    """
    words1 = set(re.findall(r'\w+', text1.lower()))
    words2 = set(re.findall(r'\w+', text2.lower()))
    if not words1 or not words2:
        return 0.0
    return len(words1 & words2) / len(words1 | words2)


def _detect_junction_tables(tables: List[Dict[str, Any]]) -> List[str]:
    """
    Heuristically detect junction / association tables in a schema.
    Returns a list of table names that are likely junction tables.

    Heuristics:
      H1: Name contains junction keywords (_map, _link, _bridge, etc.)
      H2: Has 2+ columns with FK constraints
      H3: Small table (≤8 cols) with 2+ columns ending in _id
    """
    junctions: List[str] = []

    for table in tables:
        if not isinstance(table, dict):
            continue
        name = table.get("table_name", "")
        name_lower = name.lower()
        cols = table.get("columns", [])
        if not cols:
            continue

        # H1: junction keywords in table name
        if any(kw in name_lower for kw in [
            '_map', '_link', '_bridge', '_junction', '_assoc', '_xref',
            '_intersection', '_cross',
        ]):
            junctions.append(name)
            continue

        # H2: 2+ FK constraint columns
        fk_count = sum(
            1 for c in cols
            if isinstance(c, dict) and 'fk' in (c.get('constraints', '') or '').lower()
        )
        if fk_count >= 2:
            junctions.append(name)
            continue

        # H3: small table with 2+ _id columns
        id_col_count = sum(
            1 for c in cols
            if isinstance(c, dict) and c.get('name', '').lower().endswith('_id')
        )
        if len(cols) <= 8 and id_col_count >= 2:
            junctions.append(name)
            continue

    # Deduplicate preserving order
    return list(dict.fromkeys(junctions))

# ─────────────────────────── document splitting ───────────────────────────────

def extract_document_outline(text: str) -> str:
    lines = text.split("\n")
    outline_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            outline_lines.append(stripped)
        elif re.match(r'^\d+\.\s+\w+', stripped) and len(stripped) < 100:
            outline_lines.append(stripped)
        elif re.match(r'^Module\s+\d+', stripped, re.IGNORECASE) and len(stripped) < 100:
            outline_lines.append(stripped)
    return "\n".join(outline_lines)


def extract_module_name(text: str) -> str:
    numbered = re.compile(r'^\d+\.\s*Module\s*Name\s*-\s*([^\n]+)', re.IGNORECASE)
    m = numbered.search(text)
    if m:
        return m.group(1).strip()
    module_pat = re.compile(r'Module\s*[:\-]\s*([^\n]+)', re.IGNORECASE)
    m = module_pat.search(text)
    if m:
        return m.group(1).strip()
    heading = re.compile(r'^#+\s*([^\n]+)\s*Module', re.IGNORECASE)
    m = heading.search(text)
    if m:
        return m.group(1).strip() + " Module"
    return "Core System"


def extract_module_from_text(text: str, modules: List[str]) -> Optional[str]:
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if not lines:
        return None
    for line in lines[:2]:
        cleaned = re.sub(r'^#+\s*', '', line)
        cleaned = re.sub(r'^\d+\.\s*', '', cleaned)
        cleaned = re.sub(r'^Module\s*\d+\s*[:\-]\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^Module\s*Name\s*-\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip().lower()
        for m in modules:
            m_clean   = m.strip().lower()
            m_no_mod  = re.sub(r'\s*module$', '', m_clean).strip()
            ln_no_mod = re.sub(r'\s*module$', '', cleaned).strip()
            if cleaned == m_clean or (m_no_mod and ln_no_mod == m_no_mod):
                return m
    return None


def split_document(text: str, modules: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    paragraphs    = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    chunks:       List[Dict[str, Any]] = []
    buffer        = ""
    current_module = "Core System"

    def push_buffer():
        nonlocal buffer, current_module
        cleaned = buffer.strip()
        if not cleaned:
            buffer = ""
            return
        module_name = (extract_module_from_text(cleaned, modules) if modules else None) \
                      or extract_module_name(cleaned)
        if module_name != "Core System":
            current_module = module_name
        chunks.append({"index": len(chunks), "text": cleaned, "score": 0.0, "module": current_module})
        buffer = cleaned[-CHUNK_OVERLAP:]

    for paragraph in paragraphs:
        new_module = (extract_module_from_text(paragraph, modules) if modules else None) \
                     or extract_module_name(paragraph)
        if new_module != "Core System":
            current_module = new_module
            if buffer:
                push_buffer()
        if len(paragraph) > MAX_CHUNK_SIZE:
            if buffer:
                push_buffer()
            for start in range(0, len(paragraph), MAX_CHUNK_SIZE - CHUNK_OVERLAP):
                sl = paragraph[start: start + MAX_CHUNK_SIZE].strip()
                if sl:
                    chunks.append({"index": len(chunks), "text": sl, "score": 0.0, "module": current_module})
            buffer = paragraph[-CHUNK_OVERLAP:]
            continue
        candidate = f"{buffer}\n\n{paragraph}" if buffer else paragraph
        if len(candidate) <= MAX_CHUNK_SIZE:
            buffer = candidate
        else:
            push_buffer()
            buffer = paragraph
    push_buffer()
    return chunks

# ─────────────────────────── DDL renderer ────────────────────────────────────

def generate_ddl_from_tables(tables: List[Dict[str, Any]]) -> str:
    if not tables:
        return "-- No tables specified"
    ddl_parts = []
    for table in tables:
        if not isinstance(table, dict):
            continue
        table_name  = table.get("table_name", "")
        desc        = table.get("description", "")
        columns     = table.get("columns", [])
        indexes     = table.get("indexes", [])
        table_ddl   = []
        if desc:
            table_ddl.append(f"-- Description: {desc}")
        table_ddl.append(f"CREATE TABLE {table_name} (")
        col_defs = []
        for col in columns:
            if not isinstance(col, dict):
                continue
            col_def = f"    {col.get('name','')} {col.get('type','')}"
            if col.get("constraints"):
                col_def += f" {col['constraints']}"
            if col.get("justification"):
                col_def += f", -- SRS: {col['justification'].replace(chr(10),' ').strip()}"
            else:
                col_def += ","
            col_defs.append(col_def)
        if col_defs:
            last = col_defs[-1]
            if last.endswith(","):
                col_defs[-1] = last[:-1]
            elif ", -- SRS:" in last:
                col_defs[-1] = last.replace(", -- SRS:", " -- SRS:", 1)
        table_ddl.append("\n".join(col_defs))
        table_ddl.append(");")
        for idx in indexes:
            if not isinstance(idx, str):
                continue
            idx = idx.strip()
            if not idx:
                continue
            if idx.lower().startswith("create "):
                table_ddl.append(idx if idx.endswith(";") else idx + ";")
            else:
                col_name = "id"
                for col in sorted(columns, key=lambda c: len(c.get("name", "")), reverse=True):
                    if isinstance(col, dict):
                        cn = col.get("name", "")
                        idx_clean = idx.lower()
                        if idx_clean.startswith("idx_"):
                            idx_clean = idx_clean[4:]
                        if cn and cn.lower() in idx_clean:
                            col_name = cn
                            break
                table_ddl.append(f"CREATE INDEX {idx} ON {table_name}({col_name});")
        ddl_parts.append("\n".join(table_ddl))
    return "\n\n".join(ddl_parts)

# ─────────────────────────── Node 1 — extractor ──────────────────────────────

async def extractor_node(state: GraphState) -> GraphState:
    """
    Phase 0: Ask the LLM to list all distinct modules in the SRS.
    Populates state['modules'] and resets the iteration index to 0.
    """
    print("[extractor_node] Extracting modules from document outline...")
    outline = extract_document_outline(state["normalized_text"])
    if not outline.strip():
        outline = state["normalized_text"][:12000]

    prompt = (
        "Read the SRS outline or document content below and extract a JSON array of strings "
        "representing the distinct software modules mentioned "
        "(e.g., ['Admission Module', 'Fee Management']). "
        "Only extract major functional modules. Output ONLY the JSON array, no other text.\n\n"
        f"Document Outline:\n{outline}"
    )
    model    = get_chat_model(temperature=0.0)
    response = await model.ainvoke([HumanMessage(content=prompt)])

    modules: List[str] = []
    try:
        content = response.content.strip()
        for fence in ("```json", "```"):
            if content.startswith(fence):
                content = content[len(fence):]
        if content.endswith("```"):
            content = content[:-3]
        parsed = json.loads(content.strip())
        if isinstance(parsed, list) and parsed:
            modules = parsed
    except json.JSONDecodeError:
        pass

    if not modules:
        # Regex fallback
        for m in re.finditer(r'\d+\.\s*Module\s*Name\s*-\s*([^\n]+)', state["normalized_text"], re.IGNORECASE):
            modules.append(m.group(1).strip())

    if not modules:
        modules = ["Core System"]

    print(f"[extractor_node] Found {len(modules)} modules: {modules}")
    # Return only the keys this node sets — LangGraph merges the rest
    return {
        "modules":        modules,
        "module_index":   0,
        "domain_designs": [],
        "qa_retries":     0,
    }

# ─────────────────────────── Node 2 — fetch_context ──────────────────────────

async def fetch_context_node(state: GraphState) -> GraphState:
    """
    Retrieve Chroma chunks that are relevant to the current module.
    Sets state['current_module'], state['module_context'], state['module_chunks'].
    """
    idx     = state["module_index"]
    module  = state["modules"][idx]
    print(f"[fetch_context_node] Fetching context for module {idx + 1}/{len(state['modules'])}: {module}")

    doc_id     = state["document_id"]
    request_id = state["request_id"]

    # Try module-scoped query first, then broad fallback
    chunks = query_chroma_for_chunks(
        doc_id, module, "domain_design", request_id, n_results=15, module_name=module
    )
    if not chunks:
        chunks = query_chroma_for_chunks(
            doc_id, module, "domain_design", request_id, n_results=15
        )

    context = format_chunks_as_context(chunks)
    print(f"[fetch_context_node] Retrieved {len(chunks)} chunks for '{module}'")

    # Return only the keys this node sets — LangGraph merges the rest
    return {
        "current_module": module,
        "module_context": context,
        "module_chunks":  chunks,
        "dba_draft":      {},
        "qa_feedback":    "",
        "qa_retries":     0,
        "api_design":     {},
    }

# ─────────────────────────── Node 3 — dba_agent ──────────────────────────────

_DBA_SYSTEM = (
    "You are a Principal Database Architect (Schema Architect Agent). "
    "Your sole job is to produce an exhaustive, production-ready database schema "
    "(PostgreSQL by default, or the database specified in the tech stack constraints) "
    "grounded STRICTLY in the SRS context provided. "
    "Output ONLY valid JSON — no markdown fences, no prose."
)

_DBA_PROMPT = """\
You are designing the "{MODULE_NAME}" module.

### ZERO-TOLERANCE DIRECTIVES
1. NO ABBREVIATIONS — list every field required by the SRS; never write "...", "etc.", or "similar fields".
2. EXHAUSTIVE ENUMS — capture exact status values in SQL ENUM or CHECK constraints.
3. TRACEABILITY — every column must cite the SRS line that requires it in "justification".
4. BUSINESS RULES — capture exact mathematical or logical constraints.
5. If the QA agent previously rejected your draft, address EVERY point.
6. COMPLETENESS — Generate ALL tables required by the SRS context. A typical module requires 5-15 tables. Do not stop at 2-3 tables.

{CONSTRAINTS}

### PRIOR QA FEEDBACK (if any)
{QA_FEEDBACK}

### CRITICAL MERMAID FORMATTING RULES (READ CAREFULLY)
When generating the "mermaid_er" string, you MUST follow these rules:
- Do NOT use commas between attribute lines.
- Do NOT use commas at the end of attribute lines.
- Format attributes exactly like this:
  USER {{
    uuid id PK
    string name
    string email
  }}
- Relationships must look exactly like this: USER ||--o{{ ORDER : places

### OUTPUT SCHEMA (strict JSON, no extras)
{{
  "module_name": "{MODULE_NAME}",
  "compliance_check": "Brief confirmation stating how the Tech Stack, Design Patterns, and Security constraints were applied.",
  "business_rules": [
    {{"rule_id": "BR_001", "description": "...", "srs_reference": "..."}}
  ],
  "data_model": {{
    "mermaid_er": "erDiagram\\n  ...",
    "tables": [
      {{
        "table_name": "...",
        "description": "...",
        "columns": [
          {{"name": "...", "type": "...", "constraints": "...", "justification": "..."}}
        ],
        "indexes": ["idx_..."]
      }}
    ]
  }}
}}

### SRS CONTEXT FOR {MODULE_NAME}
{CONTEXT}"""


async def dba_agent_node(state: GraphState) -> dict:
    """
    Schema Architect Agent (The DBA).
    Designs tables, ERD, and business rules for the current module.

    On first attempt: generates the full schema using the standard prompt.
    On retries: uses a TARGETED PATCH prompt that tells the LLM to output
    only the fixed/new tables, which are then programmatically merged into
    the existing draft — preventing the "whack-a-mole" regression loop.

    Returns only the keys it modifies (partial dict — LangGraph best practice).
    """
    module   = state["current_module"]
    feedback = state.get("qa_feedback", "")

    # Increment retry counter here (inside the node) if we are looping back from QA
    retries = state.get("qa_retries", 0)
    if feedback and feedback != "PASS":
        retries += 1

    # Build constraint block from user-supplied architecture constraints
    constraints_block = "### STRICT ARCHITECTURAL CONSTRAINTS\n"
    if state.get("tech_stack"):
        constraints_block += f"- TECH STACK: You MUST use {state['tech_stack']}.\n"
    if state.get("design_principles"):
        constraints_block += f"- DESIGN PATTERNS: You MUST implement {state['design_principles']}.\n"
    if state.get("security_protocols"):
        constraints_block += f"- SECURITY: You MUST enforce {state['security_protocols']}.\n"
    if constraints_block == "### STRICT ARCHITECTURAL CONSTRAINTS\n":
        constraints_block = ""  # nothing supplied — omit the section entirely

    print(f"[dba_agent_node] Designing schema for '{module}' (attempt {retries + 1})")

    # ── DYNAMIC PROMPT: targeted patch on retries, full prompt on first attempt ──
    if retries > 0 and feedback:
        system_message = (
            "You are a Principal Database Architect performing a TARGETED PATCH. "
            "The QA agent found specific errors in your previous draft. "
            "You MUST output a valid JSON object with a \"data_model\" key containing a \"tables\" array, "
            "but you only need to include the NEW or MODIFIED tables that fix the QA feedback. "
            "Do NOT rewrite the entire schema. Just output the corrected tables inside the standard JSON structure. "
            "CRITICAL: Do NOT use commas between Mermaid erDiagram attribute lines.\n\n"
            "IMPORTANT: If the QA feedback mentions a missing many-to-many relationship, "
            "you MUST create a NEW junction table (e.g., student_program_interests) to resolve it. "
            "Do NOT just add a column to the parent table.\n\n"
            "NAMING: Name junction tables descriptively using the pattern "
            "<ENTITY_A>_<ENTITY_B> (e.g., PROSPECTIVE_STUDENT_PROGRAM, STUDENT_COURSE). "
            "Include at minimum: a surrogate PK, FK to entity A, FK to entity B, "
            "and any columns explicitly mentioned in the QA feedback."
        )
        user_prompt = (
            f"QA FEEDBACK TO FIX:\n{feedback}\n\n"
            f"{constraints_block}\n\n"
            f"CURRENT SCHEMA (for reference — do NOT copy unchanged tables into your output):\n"
            f"{json.dumps(state['dba_draft'], indent=2)}\n\n"
            f"ORIGINAL SRS CONTEXT:\n{state['module_context']}\n\n"
            f"Output the corrected JSON containing ONLY the fixed or new tables."
        )
    else:
        # First attempt: use the standard full prompt
        system_message = _DBA_SYSTEM
        user_prompt = _DBA_PROMPT.format(
            MODULE_NAME  = module,
            QA_FEEDBACK  = "None — this is your first attempt.",
            CONTEXT      = state["module_context"],
            CONSTRAINTS  = constraints_block,
        )

    model    = get_chat_model(temperature=0.05)
    response = await model.ainvoke([
        SystemMessage(content=system_message),
        HumanMessage(content=user_prompt),
    ])
    new_draft = parse_llm_json(response.content)

    # ── PROGRAMMATIC MERGE — prevents whack-a-mole regressions ───────────────
    # If this is a retry, merge the patched tables into the old complete draft
    # instead of replacing the whole thing (which causes regressions).
    if retries > 0 and state.get("dba_draft") and "data_model" in new_draft:
        old_draft  = state["dba_draft"]
        old_tables = old_draft.get("data_model", {}).get("tables", [])
        new_tables = new_draft.get("data_model", {}).get("tables", [])

        if old_tables and new_tables:
            # Build a dict of old tables keyed by table_name
            tables_dict = {t.get("table_name"): t for t in old_tables if isinstance(t, dict)}

            # Overwrite old tables with fixed ones, or add brand-new ones
            for new_t in new_tables:
                if isinstance(new_t, dict) and new_t.get("table_name"):
                    tables_dict[new_t["table_name"]] = new_t

            # Reconstruct the complete, merged draft
            merged_draft = {**old_draft}
            if "compliance_check" in new_draft:
                merged_draft["compliance_check"] = new_draft["compliance_check"]
            merged_draft["data_model"] = {**old_draft.get("data_model", {})}
            merged_draft["data_model"]["tables"] = list(tables_dict.values())

            # Update business rules if the patch included new ones
            if new_draft.get("business_rules"):
                existing_rules = {r.get("rule_id"): r for r in old_draft.get("business_rules", []) if isinstance(r, dict)}
                for rule in new_draft["business_rules"]:
                    if isinstance(rule, dict) and rule.get("rule_id"):
                        existing_rules[rule["rule_id"]] = rule
                merged_draft["business_rules"] = list(existing_rules.values())

            # Debug: show merged table names for visibility
            merged_table_names = [t.get("table_name") for t in merged_draft.get("data_model", {}).get("tables", [])]
            print(f"[dba_agent_node] 🔍 Merged table names: {merged_table_names}")

            print(f"[dba_agent_node] ✅ Merged {len(new_tables)} patched table(s) into existing {len(old_tables)}-table draft")
            return {"dba_draft": merged_draft, "qa_retries": retries}

    # First attempt or merge not applicable — return the full new draft
    print(f"[dba_agent_node] Schema draft ready for '{module}'")
    return {"dba_draft": new_draft, "qa_retries": retries}

# ─────────────────────────── Node 4 — qa_agent ───────────────────────────────

_QA_SYSTEM = (
    "You are a Pragmatic Compliance Agent (QA Engineer). "
    "Audit a database schema draft against the original SRS context. "
    "Focus on CRITICAL structural issues only. Output ONLY 'PASS' or "
    "a numbered list of critical, actionable issues. No preamble.\n\n"
    "CRITICAL RULES:\n"
    "1. You MUST NOT re-raise issues from previous reviews that have been addressed.\n"
    "2. If a junction table exists for a many-to-many relationship, that relationship "
    "is SATISFIED — do not fail for missing minor columns on the junction table.\n"
    "3. If the DBA added a table or column that addresses your previous feedback, "
    "you MUST acknowledge it as RESOLVED."
)

_QA_PROMPT = """\
### MODULE UNDER REVIEW
{MODULE_NAME}

### DBA SCHEMA DRAFT
{DBA_DRAFT}

### ORIGINAL SRS CONTEXT
{CONTEXT}
{PREVIOUS_FEEDBACK}
{JUNCTION_TABLES_INFO}
### YOUR AUDIT CHECKLIST
You are a Pragmatic QA Engineer. Your goal is to validate the CORE *CAPABILITIES* \
of the schema, not to enforce a specific column structure.

1. Is the JSON valid and parseable?
2. Are the CORE entities (the main subjects of the module) represented as tables?
3. Can the schema *represent* the business relationships described in the SRS?
   - If the SRS says "record multiple X for a Y", this is a MANY-TO-MANY relationship.
   - Many-to-many relationships are modeled using a JUNCTION TABLE.
   - If a junction table exists that connects the parent entity to the child entity, \
the CORE CAPABILITY IS SATISFIED — even if some intermediate columns are missing.
   - Do NOT fail a schema because a parent table lacks a multi-value column. \
Look for junction tables FIRST.
4. Do the primary keys and core foreign keys exist?
5. Are the most critical status ENUMs present?

### CRITICAL RULES FOR FAILING:
- ONLY fail if a CORE business capability is completely impossible to represent.
- Do NOT fail for stylistic preferences or missing minor columns.
- Do NOT fail for missing report-specific tables.
- Do NOT fail for missing "mechanisms" if a status/flag/boolean column could represent it.
- Do NOT fail for missing minor columns on a junction table — the junction table's \
existence satisfies the many-to-many requirement.
- Do NOT re-raise issues from previous reviews that the DBA has addressed.
- If the Mermaid syntax has commas, ignore it as long as the JSON "tables" array is correct.

If the core capabilities are representable → respond with exactly: PASS
Otherwise → respond with a numbered list of CRITICAL missing capabilities only."""


async def qa_agent_node(state: GraphState) -> dict:
    """
    Compliance Agent (The QA).
    Audits the DBA draft. Sets qa_feedback to 'PASS' or structured feedback.

    Anti-loop measures:
      1. Injects programmatic junction-table detection into the prompt so QA
         cannot deny the existence of junction tables the DBA added.
      2. Passes previous feedback into the prompt and forces QA to verify
         whether prior issues are now RESOLVED.
      3. If new feedback is >70% similar to previous feedback (Jaccard word
         overlap), auto-passes — the DBA's patch wasn't recognised, but
         looping again won't help.
    """
    module = state["current_module"]
    previous_feedback = state.get("qa_feedback", "")
    retries = state.get("qa_retries", 0)

    print(f"[qa_agent_node] Auditing schema draft for '{module}' (review #{retries + 1})")

    # ── Programmatic junction table detection ──────────────────────────────
    tables = state.get("dba_draft", {}).get("data_model", {}).get("tables", [])
    junction_tables = _detect_junction_tables(tables)

    # ── Build "previous feedback" block for the prompt ─────────────────────
    prev_feedback_block = ""
    if previous_feedback and previous_feedback != "PASS" and retries > 0:
        prev_feedback_block = (
            f"\n### PREVIOUS QA FEEDBACK (from review #{retries})\n"
            f"The DBA has had a chance to address these issues. "
            f"You MUST verify each one and mark it RESOLVED or STILL MISSING:\n\n"
            f"{previous_feedback}\n\n"
            f"RULE: If the DBA added a table, column, or junction table that "
            f"addresses a previous issue, you MUST mark that issue RESOLVED. "
            f"Do NOT re-raise resolved issues.\n"
        )

    # ── Build "junction tables detected" block for the prompt ──────────────
    junction_info = ""
    if junction_tables:
        junction_info = (
            f"\n### JUNCTION TABLES DETECTED (programmatic scan)\n"
            f"The following tables were algorithmically detected as junction / "
            f"association tables:\n  {', '.join(junction_tables)}\n\n"
            f"RULE: If any previous QA concern was about a missing many-to-many "
            f"relationship, and a junction table now exists for it, that concern "
            f"is RESOLVED. Do NOT fail solely because the junction table is "
            f"missing minor columns (e.g., batch_id, status).\n"
        )

    # ── Run QA audit ───────────────────────────────────────────────────────
    prompt = _QA_PROMPT.format(
        MODULE_NAME=module,
        DBA_DRAFT=json.dumps(state["dba_draft"], indent=2),
        CONTEXT=state["module_context"],
        PREVIOUS_FEEDBACK=prev_feedback_block,
        JUNCTION_TABLES_INFO=junction_info,
    )
    model = get_chat_model(temperature=0.0)
    response = await model.ainvoke([
        SystemMessage(content=_QA_SYSTEM),
        HumanMessage(content=prompt),
    ])
    feedback = response.content.strip()
    result = "PASS" if feedback.upper().startswith("PASS") else feedback

    # ── Feedback similarity check (safety net against infinite loops) ──────
    if result != "PASS" and previous_feedback and previous_feedback != "PASS":
        similarity = _text_similarity(result, previous_feedback)
        if similarity > 0.70:
            print(
                f"[qa_agent_node] ⚠️  New feedback is {similarity:.0%} similar to "
                f"previous — auto-passing (DBA patch not recognised by QA, "
                f"but looping further won't help)"
            )
            result = "PASS"

    if result == "PASS":
        print(f"[qa_agent_node] QA result for '{module}': ✅ PASS")
    else:
        print(f"[qa_agent_node] QA result for '{module}': ❌ FAIL — looping back to DBA")
        print(f"[qa_agent_node] Feedback snippet: {result[:500]}...")

    return {"qa_feedback": result}

# ─────────────────────────── Node 5 — api_agent ──────────────────────────────

_API_SYSTEM = (
    "You are an API Engineer Agent (The Backend Dev). "
    "Given an approved database schema, design REST API endpoints and state-machine workflows. "
    "Output ONLY valid JSON — no markdown fences, no prose."
)

_API_PROMPT = """\
### MODULE
{MODULE_NAME}

### APPROVED DB SCHEMA
{DBA_DRAFT}

### SRS CONTEXT
{CONTEXT}

{CONSTRAINTS}

### OUTPUT SCHEMA (strict JSON)
{{
  "compliance_check": "Brief confirmation stating how the Tech Stack, Design Patterns, and Security constraints were applied in the API design.",
  "apis": [
    {{
      "method": "GET|POST|PUT|PATCH|DELETE",
      "path": "/api/v1/...",
      "description": "...",
      "request_body":  {{"field": "type"}},
      "response_body": {{"field": "type"}},
      "srs_reference": "..."
    }}
  ],
  "workflows": [
    {{
      "workflow_name": "...",
      "srs_reference": "...",
      "states": ["STATE_A", "STATE_B"],
      "transitions": [
        {{
          "from": "STATE_A",
          "to": "STATE_B",
          "trigger": "...",
          "api_endpoint": "PATCH /api/v1/.../{{id}}/action"
        }}
      ]
    }}
  ]
}}

### DIRECTIVES
- Every table in the schema must have at minimum a GET (list) and POST (create) endpoint.
- Every status field must have a PATCH endpoint covering each allowed transition.
- Workflows must mirror exact state machines described in the SRS (not invented ones).
- srs_reference must cite the SRS section, not a column name.
- All endpoints must respect the tech stack and security constraints above."""


async def api_agent_node(state: GraphState) -> dict:
    """
    API Engineer Agent (The Backend Dev).
    Designs endpoints and state-machine workflows based on the approved DB schema.
    Returns only the keys it modifies (partial dict — LangGraph best practice).
    """
    module = state["current_module"]
    print(f"[api_agent_node] Designing API layer for '{module}'")

    # Build constraint block from user-supplied architecture constraints
    constraints_block = "### STRICT ARCHITECTURAL CONSTRAINTS\n"
    if state.get("tech_stack"):
        constraints_block += f"- TECH STACK: All endpoints and middleware MUST align with {state['tech_stack']}.\n"
    if state.get("design_principles"):
        constraints_block += f"- DESIGN PATTERNS: Route design MUST follow {state['design_principles']}.\n"
    if state.get("security_protocols"):
        constraints_block += f"- SECURITY: Every endpoint MUST enforce {state['security_protocols']} (auth guards, rate limiting, input validation).\n"
    if constraints_block == "### STRICT ARCHITECTURAL CONSTRAINTS\n":
        constraints_block = ""  # nothing supplied — omit the section entirely

    prompt = _API_PROMPT.format(
        MODULE_NAME = module,
        DBA_DRAFT   = json.dumps(state["dba_draft"], indent=2),
        CONTEXT     = state["module_context"],
        CONSTRAINTS = constraints_block,
    )
    model    = get_chat_model(temperature=0.05)
    response = await model.ainvoke([
        SystemMessage(content=_API_SYSTEM),
        HumanMessage(content=prompt),
    ])
    api_design = parse_llm_json(response.content)
    print(f"[api_agent_node] API design ready for '{module}'")

    # Return ONLY the key we are updating
    return {"api_design": api_design}

# ─────────────────────────── Node 6 — save_and_iterate ───────────────────────

async def save_and_iterate_node(state: GraphState) -> GraphState:
    """
    Merges the DBA schema + API design into a single module entry,
    appends it to domain_designs, then advances the module index.
    """
    module = state["current_module"]
    print(f"[save_and_iterate_node] Saving completed design for '{module}'")

    dba    = state["dba_draft"]
    api    = state["api_design"]

    # Merge api keys into the dba dict so the output has one unified object
    merged = {**dba}
    merged["apis"]      = api.get("apis",      dba.get("apis", []))
    merged["workflows"] = api.get("workflows",  dba.get("workflows", []))
    merged["compliance_check"] = dba.get("compliance_check", "")
    merged["api_compliance_check"] = api.get("compliance_check", "")

    tables       = merged.get("data_model", {}).get("tables", [])
    sql_ddl      = generate_ddl_from_tables(tables)
    api_endpoints = [
        f"{a.get('method','GET').upper()} {a.get('path','')} - {a.get('description','')}"
        for a in merged.get("apis", []) if isinstance(a, dict) and a.get("path")
    ]

    domain_entry = {
        "module": module,
        "design": {
            "er_diagram_mermaid": merged.get("data_model", {}).get("mermaid_er", "erDiagram"),
            "sql_ddl":            sql_ddl,
            "api_endpoints":      api_endpoints,
            "raw_json":           merged,
        },
        "selected_chunks": state.get("module_chunks", []),
    }

    updated_designs = list(state.get("domain_designs", [])) + [domain_entry]
    next_index      = state["module_index"] + 1

    # Return ONLY the keys we are updating — never spread **state
    return {
        "domain_designs": updated_designs,
        "module_index":   next_index,
    }

# ─────────────────────────── Routing logic ───────────────────────────────────

def decide_after_qa(state: GraphState) -> str:
    """
    Route to 'api_agent' on PASS, back to 'dba_agent' on failure.
    Cap retries at MAX_QA_RETRIES to avoid infinite loops.
    """
    if state["qa_feedback"] == "PASS":
        return "api_agent"
    retries = state.get("qa_retries", 0)
    if retries >= MAX_QA_RETRIES:
        print(f"[decide_after_qa] Max QA retries reached for '{state['current_module']}' — proceeding anyway")
        return "api_agent"
    # Pure function — no state mutation here; dba_agent_node handles the increment
    return "dba_agent"


def decide_if_more_modules(state: GraphState) -> str:
    """
    Route to 'fetch_context' if more modules remain, otherwise END.
    """
    if state["module_index"] < len(state["modules"]):
        return "fetch_context"
    return END

# ─────────────────────────── Graph compilation ───────────────────────────────

def _build_graph() -> StateGraph:
    graph = StateGraph(GraphState)

    # Register nodes
    graph.add_node("extractor",       extractor_node)
    graph.add_node("fetch_context",   fetch_context_node)
    graph.add_node("dba_agent",       dba_agent_node)
    graph.add_node("qa_agent",        qa_agent_node)
    graph.add_node("api_agent",       api_agent_node)
    graph.add_node("save_and_iterate", save_and_iterate_node)

    # Fixed edges
    graph.set_entry_point("extractor")
    graph.add_edge("extractor",      "fetch_context")
    graph.add_edge("fetch_context",  "dba_agent")
    graph.add_edge("dba_agent",      "qa_agent")
    graph.add_edge("api_agent",      "save_and_iterate")

    # Conditional edges
    graph.add_conditional_edges(
        "qa_agent",
        decide_after_qa,
        {"api_agent": "api_agent", "dba_agent": "dba_agent"},
    )
    graph.add_conditional_edges(
        "save_and_iterate",
        decide_if_more_modules,
        {"fetch_context": "fetch_context", END: END},
    )

    return graph


# Compiled app — reused across requests
_workflow_app = _build_graph().compile()

# ─────────────────────────── Markdown renderer ───────────────────────────────

def _build_data_model_markdown(domain_designs: List[Dict[str, Any]]) -> str:
    sections = ["# Domain-Specific Data Models\n"]

    for d in domain_designs:
        module = d.get("module", "Unknown Module")
        design = d.get("design", {})
        lines  = [f"---\n\n## {module}\n"]
        rich   = design.get("raw_json", design)

        comp_check = rich.get("compliance_check")
        api_comp_check = rich.get("api_compliance_check")
        if comp_check:
            lines.append(f"> **Database Compliance:** {comp_check}\n\n")
        if api_comp_check:
            lines.append(f"> **API Compliance:** {api_comp_check}\n\n")

        if "data_model" in rich:
            dm = rich["data_model"]

            mermaid_er = dm.get("mermaid_er", "").strip()
            if mermaid_er:
                lines += ["### ER Diagram\n", f"```mermaid\n{mermaid_er}\n```\n"]

            tables = dm.get("tables", [])
            if tables:
                lines.append("### Tables\n")
                for tbl in tables:
                    tbl_name = tbl.get("table_name", "unnamed")
                    tbl_desc = tbl.get("description", "")
                    lines.append(f"#### `{tbl_name}`\n")
                    if tbl_desc:
                        lines.append(f"{tbl_desc}\n")
                    cols = tbl.get("columns", [])
                    if cols:
                        lines += [
                            "| Column | Type | Constraints | Justification |",
                            "|--------|------|-------------|---------------|",
                        ]
                        for col in cols:
                            lines.append(
                                f"| `{col.get('name','')}` | `{col.get('type','')}` "
                                f"| {col.get('constraints','')} "
                                f"| {col.get('justification','').replace('|','\\|')} |"
                            )
                        lines.append("")
                    idxs = tbl.get("indexes", [])
                    if idxs:
                        lines.append("**Indexes:** " + ", ".join(f"`{i}`" for i in idxs) + "\n")

            rules = rich.get("business_rules", [])
            if rules:
                lines += [
                    "### Business Rules\n",
                    "| Rule ID | Description | SRS Reference |",
                    "|---------|-------------|---------------|",
                ]
                for rule in rules:
                    lines.append(
                        f"| {rule.get('rule_id','')} "
                        f"| {rule.get('description','').replace('|','\\|')} "
                        f"| {rule.get('srs_reference','')} |"
                    )
                lines.append("")

            apis = rich.get("apis", [])
            if apis:
                lines += [
                    "### API Endpoints\n",
                    "| Method | Path | Description | SRS Reference |",
                    "|--------|------|-------------|---------------|",
                ]
                for api in apis:
                    lines.append(
                        f"| `{api.get('method','')}` | `{api.get('path','')}` "
                        f"| {api.get('description','').replace('|','\\|')} "
                        f"| {api.get('srs_reference','')} |"
                    )
                lines.append("")

            workflows = rich.get("workflows", [])
            if workflows:
                lines.append("### Workflows\n")
                for wf in workflows:
                    wf_name = wf.get("workflow_name", "Unnamed Workflow")
                    wf_ref  = wf.get("srs_reference", "")
                    ref_str = f" *(SRS: {wf_ref})*" if wf_ref else ""
                    lines.append(f"#### {wf_name}{ref_str}\n")
                    states = wf.get("states", [])
                    if states:
                        lines.append("**States:** " + " → ".join(f"`{s}`" for s in states) + "\n")
                    transitions = wf.get("transitions", [])
                    if transitions:
                        lines += [
                            "| From | To | Trigger | API Endpoint |",
                            "|------|----|---------|--------------|",
                        ]
                        for tr in transitions:
                            lines.append(
                                f"| `{tr.get('from','')}` | `{tr.get('to','')}` "
                                f"| {tr.get('trigger','').replace('|','\\|')} "
                                f"| `{tr.get('api_endpoint','')}` |"
                            )
                        lines.append("")
        else:
            # Legacy flat fallback
            mermaid = design.get("er_diagram_mermaid", "").strip()
            if mermaid:
                lines += ["### ER Diagram\n", f"```mermaid\n{mermaid}\n```\n"]
            ddl = design.get("sql_ddl", "").strip()
            if ddl:
                lines += ["### SQL DDL\n", f"```sql\n{ddl}\n```\n"]
            for ep in design.get("api_endpoints", []):
                lines.append(f"- `{ep}`")

        sections.append("\n".join(lines))

    return "\n".join(sections)

# ─────────────────────────── Global architecture (Phase 2 / Reduce) ──────────

async def generate_global_architecture(domain_designs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Combine all module designs into a cohesive high-level architecture."""
    parts = []
    for d in domain_designs:
        module = d.get("module", "?")
        design = d.get("design", {})
        rich   = design.get("raw_json", design)
        if "data_model" in rich:
            table_names    = ", ".join(t["table_name"] for t in rich["data_model"].get("tables", []))
            api_count      = len(rich.get("apis", []))
            rule_count     = len(rich.get("business_rules", []))
            workflow_count = len(rich.get("workflows", []))
            parts.append(
                f"- {module}: {api_count} endpoints, {rule_count} business rules, "
                f"{workflow_count} workflows, tables: [{table_names}]"
            )
        else:
            parts.append(f"- {module}: {len(design.get('api_endpoints', []))} endpoints")

    model    = get_chat_model(temperature=0.2)
    response = await model.ainvoke([
        SystemMessage(content=(
            "You are a Chief Software Architect. Based on the module summaries below, "
            "design the high-level system architecture. Include API Gateway routing, "
            "Message Queue event flows, and at least one Mermaid architecture diagram."
        )),
        HumanMessage(content="Module Summaries:\n" + "\n".join(parts)),
    ])
    return {"architecture_markdown": response.content.strip(), "module_count": len(domain_designs)}

# ─────────────────────────── Fallback design ─────────────────────────────────

def generate_fallback_design(document_text: str, document_id: str) -> Dict[str, Any]:
    normalized    = normalize_text(document_text)
    domain_hints  = detect_domain_hints(normalized)
    summary       = compact_summary(normalized)
    fallback_chunks = split_document(normalized)[:8]

    assumptions = [
        f"The product is closest to: {', '.join(domain_hints)}." if domain_hints
        else "The system is a standard web application with authenticated users.",
        "A relational database is needed for core business data.",
        "Notifications and background work should run off the request path.",
    ]
    open_questions = [
        "What are the expected traffic, latency, and availability targets?",
        "Which external integrations are required for the first release?",
        "Should the product support multi-tenancy, role-based access, or SSO?",
    ]
    highlights = []
    for chunk in fallback_chunks:
        snippet = re.sub(r'\s+', ' ', chunk["text"])[:220]
        dots = "..." if len(chunk["text"]) > 220 else ""
        highlights.append(f"Chunk {chunk['index'] + 1} | score {chunk['score']}: {snippet}{dots}")

    return {
        "projectSummary":        summary or "No summary available — review the uploaded document.",
        "assumptions":           assumptions,
        "openQuestions":         open_questions,
        "retrievalHighlights":   highlights,
        "dataModelMarkdown":     "## Fallback\n*Design generation encountered an error. Please retry.*",
        "systemDesignMarkdown":  "## Fallback\n*Design generation encountered an error. Please retry.*",
        "selectedChunkCount":    len(fallback_chunks),
        "documentLength":        len(normalized),
        "generatedAt":           time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "documentText":          normalized,
        "retrievedChunks":       fallback_chunks,
    }

# ─────────────────────────── Public entry point ──────────────────────────────

async def generate_system_design(
    document_text: str,
    tech_stack: str = "",
    design_principles: str = "",
    security_protocols: str = "",
) -> Dict[str, Any]:
    """
    Main entry point called by the FastAPI /api/design route.

    1. Normalises the document and computes a stable document_id.
    2. Checks a local JSON cache; returns it immediately on a hit.
    3. Indexes the document into Chroma.
    4. Runs the LangGraph MAS workflow (extractor → fetch_context →
       dba_agent ⇄ qa_agent → api_agent → save_and_iterate) for every module.
    5. Runs the global architecture reduce step.
    6. Writes the result to the cache and returns it.
    """
    normalized  = normalize_text(document_text)
    document_id = generate_document_id(normalized)
    request_id  = str(uuid.uuid4())

    # ── Cache lookup ────────────────────────────────────────────────────────
    cache_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"{document_id}.json")

    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cached["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            print(f"✓ Returning cached design for document: {document_id}")
            return cached
        except Exception as e:
            print(f"Cache read failed for {document_id}: {e}")

    try:
        # ── Index chunks using REGEX only (no LLM call here!) ──────────────
        print("Indexing document chunks into Chroma...")
        prelim_modules = re.findall(
            r'\d+\.\s*Module\s*Name\s*-\s*([^\n]+)', normalized, re.IGNORECASE
        )
        chunks = split_document(normalized, prelim_modules or None)
        index_chunks_to_chroma(document_id, chunks, "domain_design", request_id)
        print(f"Indexed {len(chunks)} chunks into Chroma")

        # ── Run LangGraph MAS workflow ──────────────────────────────────────
        print("Starting LangGraph MAS workflow...")
        initial_state: GraphState = {
            "normalized_text": normalized,
            "document_id":     document_id,
            "request_id":      request_id,
            "modules":         [],
            "module_index":    0,
            "current_module":  "",
            "module_context":  "",
            "module_chunks":   [],
            "dba_draft":       {},
            "qa_feedback":     "",
            "qa_retries":      0,
            "api_design":      {},
            "domain_designs":  [],
            # Architecture constraints (threaded through every agent)
            "tech_stack":          tech_stack,
            "design_principles":   design_principles,
            "security_protocols":  security_protocols,
        }

        final_state: GraphState = await _workflow_app.ainvoke(initial_state)
        domain_designs = final_state["domain_designs"]
        modules        = final_state["modules"]
        print(f"LangGraph workflow complete. {len(domain_designs)} modules processed.")

        # ── Phase 2 (Reduce): Global architecture ──────────────────────────
        print("Generating global architecture...")
        arch_res = await generate_global_architecture(domain_designs)

        # ── Assemble retrieved chunks for highlights ────────────────────────
        all_chunks: Dict[int, Dict[str, Any]] = {}
        for d in domain_designs:
            for chunk in d.get("selected_chunks", []):
                all_chunks[chunk["index"]] = chunk
        retrieved_chunks = sorted(all_chunks.values(), key=lambda c: c["index"])

        highlights = []
        for chunk in retrieved_chunks[:10]:
            snippet     = re.sub(r'\s+', ' ', chunk["text"])[:220]
            dots        = "..." if len(chunk["text"]) > 220 else ""
            module_info = f" [{chunk.get('module', 'Unknown')}]" if "module" in chunk else ""
            highlights.append(
                f"Chunk {chunk['index'] + 1}{module_info} | score {chunk['score']}: {snippet}{dots}"
            )

        # ── Build final response ────────────────────────────────────────────
        result = {
            "projectSummary":       f"Domain-driven design for {len(modules)} modules: {', '.join(modules)}",
            "assumptions": [
                "Each module is designed independently to ensure comprehensive coverage.",
                "Global architecture provides integration patterns between modules.",
                "Database schemas are normalised per module with cross-module relationships.",
            ],
            "openQuestions": [
                "What are the specific data-flow requirements between modules?",
                "Are there shared entities that need to be normalised across module boundaries?",
                "What are the transactional consistency requirements across module boundaries?",
            ],
            "retrievalHighlights":  highlights,
            "dataModelMarkdown":    _build_data_model_markdown(domain_designs),
            "systemDesignMarkdown": arch_res["architecture_markdown"],
            "selectedChunkCount":   len(retrieved_chunks),
            "documentLength":       len(normalized),
            "generatedAt":          time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "documentText":         normalized,
            "retrievedChunks":      retrieved_chunks,
            "modules":              modules,
            "domainDesigns":        domain_designs,
        }

        # ── Write to cache ──────────────────────────────────────────────────
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"✓ Cached design for document: {document_id}")
        except Exception as e:
            print(f"Cache write failed for {document_id}: {e}")

        return result

    except Exception as e:
        import traceback
        print(f"Design generation error: {e}")
        traceback.print_exc()
        return generate_fallback_design(normalized, document_id)

    finally:
        try:
            clear_chroma_chunks(document_id, "domain_design", request_id)
        except Exception:
            pass
