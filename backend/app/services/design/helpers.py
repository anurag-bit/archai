import os
import re
import json
import hashlib
from typing import List, Dict, Any
from langchain_openai import ChatOpenAI
from core.config import OPENAI_MODEL

def get_chat_model(temperature: float = 0.0) -> ChatOpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    return ChatOpenAI(
        model=OPENAI_MODEL,
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
