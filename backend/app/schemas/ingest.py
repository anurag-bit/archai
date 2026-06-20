from typing import List, Dict, Any, Union, Optional
from pydantic import BaseModel

class DocumentInput(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None

class IngestRequest(BaseModel):
    documents: List[Union[str, DocumentInput]]
    metadata: Optional[List[Dict[str, Any]]] = None
