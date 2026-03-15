"""Rotas /rtg/* — Missões do RTG."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models.db_models import RTGMission
from backend.models.schemas import RTGMissionResponse
from backend.routers.patio import get_yard
from backend.services.mission_generator import generate_place_mission, generate_retrieve_mission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rtg", tags=["RTG"])


@router.get("/missao", response_model=RTGMissionResponse)
async def get_mission(
    container_id: int = Query(...),
    rtg_bay: int = Query(0),
    rtg_row: int = Query(0),
    block_name: str = Query("A1"),
    session: AsyncSession = Depends(get_session),
):
    """Gerar a sequência de movimentos do RTG para um contentor."""
    yard = get_yard(block_name)
    info = yard.container_registry.get(container_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Container {container_id} não encontrado no pátio.")
    if not info.position:
        raise HTTPException(status_code=404, detail=f"Container {container_id} sem posição atribuída.")

    bay, row, tier = info.position
    rtg_pos = (rtg_bay, rtg_row)

    mission = generate_place_mission(container_id, bay, row, tier, rtg_pos)

    # Persistir missão no DB
    db_mission = RTGMission(
        mission_id=mission["mission_id"],
        mission_type=mission["mission_type"],
        container_id=container_id,
        block_id=yard.block_id,
        steps=mission["steps"],
        total_time_s=mission["total_estimated_time_s"],
        rtg_start_pos={"bay": rtg_pos[0], "row": rtg_pos[1]},
        rtg_end_pos={"bay": bay, "row": row},
    )
    session.add(db_mission)
    await session.commit()

    return RTGMissionResponse(**mission)
