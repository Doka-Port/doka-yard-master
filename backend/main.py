"""FastAPI application — Motor de Otimização de Empilhamento de Contentores."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from backend.database import init_db, async_session
from backend.models.db_models import Block
from backend.models.yard_state import YardState
from backend.routers import patio, otimizador, rtg, gate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: criar tabelas e reconstruir cache do DB."""
    logger.info("Starting up — initializing database...")
    await init_db()

    # Reconstruir cache de todos os blocos activos
    async with async_session() as session:
        result = await session.execute(select(Block).where(Block.is_active == True))
        blocks = result.scalars().all()
        for block in blocks:
            state = await YardState.rebuild_from_db(session, block)
            patio.yard_states[block.block_name] = state
            logger.info(f"Rebuilt cache for block {block.block_name}: {state.current_occupancy} containers")

    logger.info(f"Startup complete. {len(patio.yard_states)} block(s) loaded.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Motor de Otimização de Empilhamento de Contentores",
    description="Sistema de alocação inteligente de contentores em terminais portuários usando PSO.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "blocks_loaded": len(patio.yard_states)}

app.include_router(patio.router, prefix="/api/v1")
app.include_router(otimizador.router, prefix="/api/v1")
app.include_router(rtg.router, prefix="/api/v1")
app.include_router(gate.router, prefix="/api/v1")

# Servir frontend estático (DEVE ser o último — catch-all)
try:
    app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
except Exception:
    pass
