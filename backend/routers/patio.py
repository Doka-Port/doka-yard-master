"""Rotas /patio/* — Gestão do pátio."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.models.db_models import AllocationLog, Block, Container
from backend.models.schemas import InitializeRequest, InitializeResponse, YardStateResponse, ContainerState
from backend.models.yard_state import YardState

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/patio", tags=["Pátio"])

# Cache global dos YardStates por block_name
yard_states: dict[str, YardState] = {}


def get_yard(block_name: str = "A1") -> YardState:
    if block_name not in yard_states:
        raise HTTPException(status_code=409, detail=f"Bloco '{block_name}' não inicializado. Use POST /patio/inicializar primeiro.")
    return yard_states[block_name]


@router.post("/inicializar", response_model=InitializeResponse, status_code=201)
async def inicializar_patio(req: InitializeRequest, session: AsyncSession = Depends(get_session)):
    """Criar ou resetar a matriz do pátio."""
    # Verificar se bloco já existe
    result = await session.execute(select(Block).where(Block.block_name == req.block_name))
    block = result.scalar_one_or_none()

    if block:
        # Reset: remover todos os contentores (activos e inactivos)
        await session.execute(
            delete(Container).where(Container.block_id == block.id)
        )
        block.num_bays = req.num_bays
        block.num_rows = req.num_rows
        block.max_tiers = req.max_tiers
    else:
        block = Block(
            block_name=req.block_name,
            num_bays=req.num_bays,
            num_rows=req.num_rows,
            max_tiers=req.max_tiers,
        )
        session.add(block)

    await session.commit()
    await session.refresh(block)

    # Criar cache em memória
    state = YardState(
        block_id=block.id,
        block_name=block.block_name,
        num_bays=block.num_bays,
        num_rows=block.num_rows,
        max_tiers=block.max_tiers,
    )
    # Setup reefer slots: first 2 rows for bays 0-4 (30 slots with reefer outlets)
    for b in range(min(5, state.num_bays)):
        for r in range(min(2, state.num_rows)):
            state.reefer_slots.add((b, r))

    yard_states[block.block_name] = state

    logger.info(f"Pátio '{block.block_name}' inicializado: {req.num_bays}×{req.num_rows}×{req.max_tiers}")

    return InitializeResponse(
        status="initialized",
        block_name=block.block_name,
        dimensions={"bays": block.num_bays, "rows": block.num_rows, "tiers": block.max_tiers},
        total_capacity=state.total_capacity,
        current_occupancy=0,
    )


@router.get("/estado", response_model=YardStateResponse)
async def estado_patio(block_name: str = "A1"):
    """Snapshot completo do pátio para o front-end."""
    yard = get_yard(block_name)

    containers = []
    for cid, info in yard.container_registry.items():
        if info.position:
            containers.append(ContainerState(
                container_id=cid,
                position=list(info.position),
                weight_class=info.weight_class,
                departure_time=info.departure_time.isoformat(),
                flow_type=info.flow_type,
                is_reefer=info.is_reefer,
                imo_class=info.imo_class,
            ))

    return YardStateResponse(
        block_name=yard.block_name,
        dimensions={"bays": yard.num_bays, "rows": yard.num_rows, "tiers": yard.max_tiers},
        occupancy_rate=round(yard.occupancy_rate, 4),
        total_containers=yard.current_occupancy,
        containers=containers,
        heatmap=yard.get_heatmap(),
        reefer_slots=[list(s) for s in yard.reefer_slots],
    )


@router.get("/analytics")
async def analytics(block_name: str = "A1", session: AsyncSession = Depends(get_session)):
    """Métricas de eficiência para o dashboard."""
    yard = get_yard(block_name)

    # Buscar bloco
    result = await session.execute(select(Block).where(Block.block_name == block_name))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Bloco não encontrado")

    # Métricas de alocação
    alloc_result = await session.execute(
        select(
            func.count(AllocationLog.id).label("total_allocations"),
            func.avg(AllocationLog.cost_score).label("avg_cost"),
            func.sum(AllocationLog.computation_ms).label("total_ms"),
        ).where(AllocationLog.block_id == block.id)
    )
    row = alloc_result.one()

    # Contagem de remoções (containers inativos)
    removed_result = await session.execute(
        select(func.count(Container.id)).where(
            Container.block_id == block.id,
            Container.is_active == False,  # noqa: E712
        )
    )
    total_removals = removed_result.scalar() or 0

    return {
        "total_allocations": row.total_allocations or 0,
        "avg_cost": round(row.avg_cost or 0, 4),
        "total_computation_ms": row.total_ms or 0,
        "total_removals": total_removals,
        "current_occupancy": yard.current_occupancy,
        "total_capacity": yard.total_capacity,
        "occupancy_rate": round(yard.occupancy_rate, 4),
    }
