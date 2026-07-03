import re
import json
from typing import List, Dict, Any, Optional
from langchain_core.messages import HumanMessage
from core.config import MAX_CHUNK_SIZE, CHUNK_OVERLAP
from services.design.helpers import get_chat_model
import logging
logger = logging.getLogger(__name__)



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


async def extract_modules(normalized_text: str, constraints: str = "") -> List[str]:
    """
    Ask the LLM to list all distinct modules in the SRS.
    """
    logger.info("[extractor] Extracting modules from document outline...")
    outline = extract_document_outline(normalized_text)
    if not outline.strip():
        outline = normalized_text[:12000]

    prompt = (
        "Read the SRS outline or document content below and extract a JSON array of strings "
        "representing the distinct software modules mentioned "
        "(e.g., ['Admission Module', 'Fee Management']). "
        "Only extract major functional modules. Output ONLY the JSON array, no other text.\n\n"
    )
    
    # If security constraints are provided, force an Auth module to prevent scattered user tables
    if constraints:
        prompt += (
            f"CRITICAL ARCHITECTURAL CONSTRAINTS TO CONSIDER:\n{constraints}\n\n"
            "If the constraints mention authentication, authorization, RBAC, roles, or SSO, "
            "you MUST ensure there is exactly one centralized module for user identity and access control (e.g., users, roles, sessions). "
            "If the SRS outline already contains an identity/auth/user-focused module (e.g., 'Identity Module', 'Auth Module', 'User Management', or similar), "
            "use or consolidate into that module. "
            "Only if no such module is present in the outline should you add a new module named 'User & Access Management'. "
            "Do NOT output duplicate or overlapping user identity modules.\n\n"
        )

    prompt += f"Document Outline:\n{outline}"
    
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
        import json_repair
        try:
            match = re.search(r'\[.*\]', content.strip(), re.DOTALL)
            repair_target = match.group(0) if match else content.strip()
            parsed = json_repair.loads(repair_target)
            if isinstance(parsed, list) and parsed:
                modules = parsed
        except Exception:
            pass

    if not modules:
        # Regex fallback
        for m in re.finditer(r'\d+\.\s*Module\s*Name\s*-\s*([^\n]+)', normalized_text, re.IGNORECASE):
            modules.append(m.group(1).strip())

    if not modules:
        modules = ["Core System"]

    logger.info(f"[extractor] Found {len(modules)} modules: {modules}")
    return modules
