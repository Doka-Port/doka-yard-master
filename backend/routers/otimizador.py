"""Rotas /otimizador/* — Alocação de contentores."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models.db_models import AllocationLog, Container
from backend.models.schemas import AllocationRequest, AllocationResponse, BatchAllocationRequest
from backend.models.yard_state import ContainerInfo
from backend.routers.patio import get_yard, yard_states
from backend.services.allocator import allocate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/otimizador", tags=["Otimizador"])


async def _allocate_single(
    req: AllocationRequest,
    session: AsyncSession,
    block_name: str = "A1",
) -> AllocationResponse:
    yard = get_yard(block_name)

    # Validações
    if req.container_id in yard.container_registry:
        raise HTTPException(status_code=400, detail=f"Container {req.container_id} já está no pátio.")

    now = datetime.now(timezone.utc)
    if req.departure_time.tzinfo is None:
        dep = req.departure_time.replace(tzinfo=timezone.utc)
    else:
        dep = req.departure_time

    if dep < now:
        raise HTTPException(status_code=400, detail="departure_time não pode estar no passado.")

    if req.rtg_position:
        if req.rtg_position[0] < 0 or req.rtg_position[0] >= yard.num_bays:
            raise HTTPException(status_code=400, detail="rtg_position bay fora dos limites.")
        if req.rtg_position[1] < 0 or req.rtg_position[1] >= yard.num_rows:
            raise HTTPException(status_code=400, detail="rtg_position row fora dos limites.")

    container = ContainerInfo(
        container_id=req.container_id,
        weight_class=req.weight_class,
        weight_kg=req.weight_kg,
        departure_time=dep,
        flow_type=req.flow_type,
        arrival_time=now,
    )

    rtg_pos = tuple(req.rtg_position) if req.rtg_position else None

    result = allocate(yard, container, rtg_pos, use_pso=True)

    if result is None:
        raise HTTPException(status_code=503, detail="Capacidade esgotada. Pátio cheio.")

    # Write-through: DB primeiro
    db_container = Container(
        container_id=req.container_id,
        block_id=yard.block_id,
        weight_class=req.weight_class,
        weight_kg=req.weight_kg,
        departure_time=dep,
        flow_type=req.flow_type,
        bay=result.bay,
        row=result.row,
        tier=result.tier,
        arrival_time=now,
    )
    session.add(db_container)

    log_entry = AllocationLog(
        container_id=req.container_id,
        block_id=yard.block_id,
        assigned_bay=result.bay,
        assigned_row=result.row,
        assigned_tier=result.tier,
        cost_score=result.cost_score,
        cost_reshuffle=result.cost_breakdown.get("reshuffle_penalty"),
        cost_weight=result.cost_breakdown.get("weight_deviation"),
        cost_distance=result.cost_breakdown.get("rtg_distance"),
        cost_grouping=result.cost_breakdown.get("grouping_penalty"),
        alternatives=result.alternatives,
        optimizer_type=result.optimizer_type,
        computation_ms=result.computation_ms,
    )
    session.add(log_entry)
    await session.commit()

    # Atualizar cache
    yard.place_container(container, result.bay, result.row, result.tier)

    logger.info(
        f"Container {req.container_id} → ({result.bay},{result.row},{result.tier}) "
        f"score={result.cost_score:.3f} [{result.optimizer_type}] {result.computation_ms}ms"
    )

    warning = None
    if result.cost_score > 70.0:
        warning = "high_reshuffle_risk"

    return AllocationResponse(
        container_id=req.container_id,
        assigned_position=[result.bay, result.row, result.tier],
        cost_score=result.cost_score,
        cost_breakdown=result.cost_breakdown,
        alternatives=result.alternatives,
        timestamp=now.isoformat(),
        warning=warning,
    )


@router.post("/alocacao", response_model=AllocationResponse)
async def alocar_contentor(req: AllocationRequest, session: AsyncSession = Depends(get_session)):
    """Receber dados de um contentor e devolver a posição ótima."""
    return await _allocate_single(req, session)


@router.post("/batch", response_model=list[AllocationResponse])
async def alocar_batch(req: BatchAllocationRequest, session: AsyncSession = Depends(get_session)):
    """Alocar múltiplos contentores sequencialmente."""
    results = []
    for container_req in req.containers:
        if req.rtg_position and not container_req.rtg_position:
            container_req.rtg_position = req.rtg_position
        resp = await _allocate_single(container_req, session)
        results.append(resp)
    return results
