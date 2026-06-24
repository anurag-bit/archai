import os
import re
import json
import hashlib
import logging
from typing import List, Dict, Any
from langchain_openai import ChatOpenAI
import core.config

logger = logging.getLogger(__name__)

def get_chat_model(temperature: float = 0.0) -> Any:
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    
    fallback_model = ChatOpenAI(
        model=core.config.OPENAI_MODEL,
        temperature=temperature,
        openai_api_key=openai_key,
        request_timeout=120,
    )
    
    if core.config.ZAI_API_KEY:
        primary_model = ChatOpenAI(
            model=core.config.ZAI_MODEL,
            temperature=temperature,
            openai_api_key=core.config.ZAI_API_KEY,
            openai_api_base=core.config.ZAI_API_BASE,
            request_timeout=120,
        )
        return primary_model.with_fallbacks([fallback_model])
    
    return fallback_model


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def generate_document_id(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def parse_llm_json(content: str) -> Dict[str, Any]:
    content = content.strip()
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    
    # Strip trailing commas right before a closing brace or bracket
    content_str = re.sub(r',\s*([\]}])', r'\1', content.strip())
    
    try:
        return json.loads(content_str)
    except json.JSONDecodeError:
        try:
            return json.loads(content.strip())
        except json.JSONDecodeError as e:
            logger.warning(f"⚠️ JSON-DECODE-FAIL: Failed to parse JSON from LLM response ({e}). Returning raw fallback. Content snippet: {content[:200]}...")
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
    # 1. Basic length metadata
    total_chars = len(text)
    total_words = len(text.split())
    lines = text.splitlines()
    total_lines = len(lines)
    
    # 2. Extract headings/outline (Markdown headers, e.g. #, ##, ### or numbered headings like 1.1, etc.)
    headings = []
    for line in lines:
        stripped = line.strip()
        # Markdown headings
        if stripped.startswith('#'):
            headings.append(stripped.lstrip('#').strip())
        # Classic outline headers e.g. "Section 1:", "1. Introduction"
        elif re.match(r'^(?:[0-9]+\.[0-9.]*|section\s+[0-9]+)\s+', stripped, re.IGNORECASE):
            headings.append(stripped)
        if len(headings) >= 10:  # Cap outline size
            break
            
    # 3. Extract potential modules/services
    modules = []
    for line in lines:
        m = re.search(r'(?:module|service|subsystem):\s*([A-Za-z0-9\s\-&]+)', line, re.IGNORECASE)
        if m:
            modules.append(m.group(1).strip())
        else:
            m2 = re.search(r'([A-Za-z0-9\s\-&]+)\s+(?:Module|Service|Subsystem)', line, re.IGNORECASE)
            if m2:
                modules.append(m2.group(1).strip() + " Module")
        if len(modules) >= 10:
            break
            
    unique_modules = []
    seen = set()
    for m in modules:
        m_clean = m.lower().strip()
        if m_clean and m_clean not in seen and len(m_clean) > 3 and len(m_clean) < 50:
            seen.add(m_clean)
            unique_modules.append(m)

    # 4. Get domain hints
    hints = detect_domain_hints(text)
    hints_str = ", ".join(hints) if hints else "General Application"
    
    # 5. Extract first couple of sentences as introduction/overview
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    overview = " ".join(sentences[:3]) if sentences else text[:300]
    if len(overview) > 300:
        overview = overview[:300] + "..."
        
    # 6. Build a structured overview markdown summary
    summary_parts = [
        f"**Overview:** {overview}",
        f"**Metadata:** Document size is {total_chars:,} characters (~{total_words:,} words across {total_lines:,} lines).",
        f"**Domain Classification:** {hints_str}."
    ]
    if unique_modules:
        summary_parts.append(f"**Heuristically Identified Modules/Services:** {', '.join(unique_modules)}")
    if headings:
        summary_parts.append("**Document Outline/Key Sections Detected:**\n" + "\n".join(f"- {h}" for h in headings))
        
    return "\n\n".join(summary_parts)


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


async def invoke_with_retry_and_validation(
    model, 
    messages, 
    parser=parse_llm_json, 
    validator=None, 
    max_attempts=3
) -> dict:
    """
    Invokes the model, parses JSON from the response, validates it, and retries on failure.
    """
    last_parsed = None
    for attempt in range(max_attempts):
        try:
            response = await model.ainvoke(messages)
            parsed = parser(response.content)
            
            if parsed and "raw" not in parsed:
                if validator:
                    validator(parsed)
                return parsed
            
            logger.warning(
                f"⚠️ LLM response was not valid JSON on attempt {attempt + 1}. Content snippet: {response.content[:200]}..."
            )
            last_parsed = parsed
        except Exception as e:
            logger.warning(
                f"⚠️ Attempt {attempt + 1} failed during LLM invocation or validation: {e}"
            )
            try:
                if parsed:
                    last_parsed = parsed
                else:
                    last_parsed = {"raw": response.content}
            except Exception:
                last_parsed = {"raw": "Failed to parse content or model failed to respond"}
                
    # If all attempts fail, return the last parsed result
    return last_parsed or {"raw": "Failed all attempts to retrieve valid JSON"}
