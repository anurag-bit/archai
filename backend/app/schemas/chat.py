from pydantic import BaseModel

class ChatRequest(BaseModel):
    question: str
    k: int = 3
    temperature: float = 0.0
