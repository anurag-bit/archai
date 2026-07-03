import os
import sys

# Add the directory containing main.py to Python's sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import PORT

# Import routers from the routes package
from routes import (
    health_router,
    chat_router,
    design_router,
    ingest_router,
    search_router,
)

import logging
logger = logging.getLogger(__name__)

from services.vector_store import (
    sweep_temporary_chunks,
    get_embeddings,
    start_sweep_scheduler,
    stop_sweep_scheduler
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    try:
        get_embeddings()
        sweep_temporary_chunks()
        start_sweep_scheduler()
    except Exception as e:
        logger.error(f"Warning: Startup check failed: {e}")
    yield
    # Shutdown logic
    try:
        stop_sweep_scheduler()
    except Exception as e:
        logger.error(f"Error stopping sweep scheduler: {e}")

app = FastAPI(title="Archai Backend", version="1.0.0", lifespan=lifespan)

# Enable CORS for ease of development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(health_router)
app.include_router(chat_router)
app.include_router(design_router)
app.include_router(ingest_router)
app.include_router(search_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
