import uuid
import traceback
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from pydantic import BaseModel
from services.design import generate_system_design, regenerate_module_design, apply_schema_patch
from utils.pdf_parser import extract_pdf_text

router = APIRouter()

@router.post("/api/design")
async def design_endpoint(
    requirements: str = Form(""),
    document: Optional[UploadFile] = File(None),
    tech_stack: str = Form(""),
    design_principles: str = Form(""),
    security_protocols: str = Form(""),
    open_questions_answers: str = Form(""),
):
    try:
        MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
        document_text = requirements.strip()

        if document and document.filename:
            # Read file bytes
            file_bytes = await document.read()
            if len(file_bytes) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds maximum size of {MAX_FILE_SIZE / 1024 / 1024} MB."
                )

            # Extract text
            filename_lower = document.filename.lower()
            if filename_lower.endswith(".pdf") or document.content_type == "application/pdf":
                uploaded_text = extract_pdf_text(file_bytes)
            else:
                uploaded_text = file_bytes.decode("utf-8", errors="ignore").strip()

            if uploaded_text:
                document_text = "\n\n".join(filter(None, [requirements, uploaded_text]))

        if not document_text:
            raise HTTPException(
                status_code=400,
                detail="Add a requirements document or paste requirement text before generating."
            )

        result = await generate_system_design(
            document_text,
            tech_stack=tech_stack,
            design_principles=design_principles,
            security_protocols=security_protocols,
            open_questions_answers=open_questions_answers,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Design generation error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred", "requestId": request_id}
        )

@router.post("/api/design/{document_id}/regenerate/{module_name}")
async def regenerate_module_endpoint(document_id: str, module_name: str):
    try:
        result = await regenerate_module_design(document_id, module_name)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Module regeneration error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred during module regeneration", "requestId": request_id}
        )


class PatchSchemaRequest(BaseModel):
    tables: List[Dict[str, Any]]


@router.patch("/api/design/{document_id}/patch/{module_name}")
async def patch_schema_endpoint(document_id: str, module_name: str, req: PatchSchemaRequest):
    try:
        result = await apply_schema_patch(document_id, module_name, req.tables)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        request_id = str(uuid.uuid4())
        print(f"[Request {request_id}] Schema patch error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred during schema patching", "requestId": request_id}
        )
