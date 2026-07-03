import uuid
import traceback
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from pydantic import BaseModel
from services.design import generate_system_design, regenerate_module_design, apply_schema_patch, resume_module_design, refine_system_design
from utils.pdf_parser import extract_pdf_text
import logging
logger = logging.getLogger(__name__)



import json
from fastapi.responses import StreamingResponse

router = APIRouter()

@router.post("/api/design")
async def design_endpoint(
    requirements: str = Form(""),
    document: Optional[UploadFile] = File(None),
    tech_stack: str = Form(""),
    design_principles: str = Form(""),
    security_protocols: str = Form(""),
    open_questions_answers: str = Form(""),
    cloud_provider: str = Form("aws"),
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

        async def event_generator():
            try:
                async for event in generate_system_design(
                    document_text,
                    tech_stack=tech_stack,
                    design_principles=design_principles,
                    security_protocols=security_protocols,
                    open_questions_answers=open_questions_answers,
                    cloud_provider=cloud_provider,
                ):
                    yield f"data: {json.dumps(event)}\n\n"
            except Exception as e:
                logger.error(f"SSE stream error: {e}")
                err_payload = {"phase": "done", "status": "error", "error": str(e)}
                yield f"data: {json.dumps(err_payload)}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())
        logger.error(f"[Request {request_id}] Design generation error: {traceback.format_exc()}")
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
        logger.error(f"[Request {request_id}] Module regeneration error: {traceback.format_exc()}")
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
        logger.error(f"[Request {request_id}] Schema patch error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred during schema patching", "requestId": request_id}
        )


class ResumeDesignRequest(BaseModel):
    module_name: str
    instruction: str


@router.post("/api/design/{document_id}/resume")
async def resume_design_endpoint(document_id: str, req: ResumeDesignRequest):
    try:
        result = await resume_module_design(document_id, req.module_name, req.instruction)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        request_id = str(uuid.uuid4())
        logger.error(f"[Request {request_id}] Resume design error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred during design resumption", "requestId": request_id}
        )


class RefineDesignRequest(BaseModel):
    message: str


@router.post("/api/design/{document_id}/refine")
async def refine_design_endpoint(document_id: str, req: RefineDesignRequest):
    try:
        result = await refine_system_design(document_id, req.message)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        request_id = str(uuid.uuid4())
        logger.error(f"[Request {request_id}] Refine design error: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail={"error": "An internal error occurred during design refinement", "requestId": request_id}
        )
