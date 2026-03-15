"""Rota POST /gate-in — Entrada de contentores com resposta 3D-compatible."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from sqlalchemy import select, update
from backend.models.db_models import AllocationLog, Container
from backend.models.schemas import GateInRequest, GateInResponse, Container3D, RetirarRequest, RetirarResponse, ReshuffleMove, PSOIterationData
from backend.models.yard_state import ContainerInfo, YardState
from backend.routers.patio import get_yard
from backend.services.allocator import allocate

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Gate"])

# ─── 3D spacing constants (metros, escala real de contentor 20ft) ───
SPACING_X = 6.5   # ~6.1m de um contentor 20ft + gap
SPACING_Y = 2.9   # ~2.6m de altura + gap
SPACING_Z = 2.8   # ~2.44m de largura + gap

# Cores por weight_class (Doka Style Guide)
WEIGHT_COLORS = {
    "HEAVY":  "#C94F4F",  # Doka Error Red
    "MEDIUM": "#E8A838",  # Doka Warning Gold
    "LIGHT":  "#7BB3CC",  # Doka Brand Blue
}


def _container_to_3d(cid: int, info: ContainerInfo, highlight: bool = False) -> Container3D:
    """Converte ContainerInfo para Container3D com coordenadas de espaço 3D."""
    bay, row, tier = info.position or (0, 0, 0)
    return Container3D(
        id=cid,
        x=bay * SPACING_X,
        y=tier * SPACING_Y,
        z=row * SPACING_Z,
        bay=bay,
        row=row,
        tier=tier,
        color=WEIGHT_COLORS.get(info.weight_class, "#8899aa"),
        weight_class=info.weight_class,
        weight_kg=info.weight_kg,
        flow_type=info.flow_type,
        departure_time=info.departure_time.isoformat() if info.departure_time else "",
        opacity=1.0 if not highlight else 0.85,
    )


def _build_yard_3d(yard: YardState) -> list[Container3D]:
    """Snapshot 3D de todos os contentores no pátio."""
    return [
        _container_to_3d(cid, info)
        for cid, info in yard.container_registry.items()
        if info.position is not None
    ]


@router.post("/gate-in", response_model=GateInResponse)
async def gate_in(req: GateInRequest, session: AsyncSession = Depends(get_session)):
    """Entrada de contentor no terminal.

    1. Valida dados do contentor
    2. Executa PSO para encontrar posição óptima
    3. Persiste no DB (write-through)
    4. Retorna posição + dados 3D para o frontend React Three Fiber
    """
    yard = get_yard(req.block_name)

    # ─── Validações ───
    if req.container_id in yard.container_registry:
        raise HTTPException(status_code=400, detail=f"Container {req.container_id} já está no pátio.")

    now = datetime.now(timezone.utc)
    dep = req.departure_time.replace(tzinfo=timezone.utc) if req.departure_time.tzinfo is None else req.departure_time

    if dep < now:
        raise HTTPException(status_code=400, detail="departure_time não pode estar no passado.")

    if req.rtg_position:
        if not (0 <= req.rtg_position[0] < yard.num_bays):
            raise HTTPException(status_code=400, detail="rtg_position bay fora dos limites.")
        if not (0 <= req.rtg_position[1] < yard.num_rows):
            raise HTTPException(status_code=400, detail="rtg_position row fora dos limites.")

    # ─── Construir ContainerInfo ───
    container = ContainerInfo(
        container_id=req.container_id,
        weight_class=req.weight_class,
        weight_kg=req.weight_kg,
        departure_time=dep,
        flow_type=req.flow_type,
        arrival_time=now,
    )

    rtg_pos = tuple(req.rtg_position) if req.rtg_position else None

    # ─── PSO Optimization ───
    result = allocate(yard, container, rtg_pos, use_pso=True)

    if result is None:
        raise HTTPException(status_code=503, detail="Capacidade esgotada. Pátio cheio.")

    # ─── Write-through: DB primeiro ───
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

    # ─── Atualizar cache ───
    yard.place_container(container, result.bay, result.row, result.tier)

    logger.info(
        f"GATE-IN Container {req.container_id} → ({result.bay},{result.row},{result.tier}) "
        f"score={result.cost_score:.2f} [{result.optimizer_type}] {result.computation_ms}ms"
    )

    # ─── Construir resposta 3D ───
    container_3d = _container_to_3d(req.container_id, container)
    yard_3d = _build_yard_3d(yard)

    warning = None
    if result.cost_score > 70.0:  # com pesos agressivos (100/10/1), >70 é preocupante
        warning = "high_reshuffle_risk"

    # Converter pso_history do allocator para schema Pydantic
    pso_history_schema = None
    if result.pso_history:
        pso_history_schema = [
            PSOIterationData(
                iteration=h.iteration,
                particles=h.particles,
                particles_discrete=h.particles_discrete,
                particle_scores=h.particle_scores,
                g_best_position=h.g_best_position,
                g_best_score=h.g_best_score,
                inertia=h.inertia,
            )
            for h in result.pso_history
        ]

    return GateInResponse(
        container_id=req.container_id,
        assigned_position=[result.bay, result.row, result.tier],
        cost_score=result.cost_score,
        cost_breakdown=result.cost_breakdown,
        alternatives=result.alternatives,
        optimizer_type=result.optimizer_type,
        computation_ms=result.computation_ms,
        warning=warning,
        timestamp=now.isoformat(),
        container_3d=container_3d,
        yard_3d=yard_3d,
        pso_history=pso_history_schema,
        yard_stats={
            "total_containers": yard.current_occupancy,
            "total_capacity": yard.total_capacity,
            "occupancy_rate": round(yard.occupancy_rate, 4),
            "dimensions": {
                "bays": yard.num_bays,
                "rows": yard.num_rows,
                "tiers": yard.max_tiers,
            },
        },
    )


def _build_yard_stats(yard: YardState) -> dict:
    return {
        "total_containers": yard.current_occupancy,
        "total_capacity": yard.total_capacity,
        "occupancy_rate": round(yard.occupancy_rate, 4),
        "dimensions": {
            "bays": yard.num_bays,
            "rows": yard.num_rows,
            "tiers": yard.max_tiers,
        },
    }


@router.post("/retirar", response_model=RetirarResponse)
async def retirar_container(req: RetirarRequest, session: AsyncSession = Depends(get_session)):
    """Retirar um contentor do pátio.

    Se há contentores em cima do alvo, faz reshuffle automático:
    - Remove os contentores acima (do topo para baixo)
    - Realoca cada um usando o otimizador para a melhor posição disponível
    - Depois remove o contentor alvo
    """
    yard = get_yard(req.block_name)
    now = datetime.now(timezone.utc)

    info = yard.container_registry.get(req.container_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Container {req.container_id} não encontrado no pátio.")
    if not info.position:
        raise HTTPException(status_code=404, detail=f"Container {req.container_id} sem posição atribuída.")

    bay, row, tier = info.position
    stack = yard.get_stack(bay, row)

    reshuffles: list[ReshuffleMove] = []

    # Containers acima do alvo precisam de reshuffle (do topo para baixo)
    containers_above = []
    for t in range(len(stack) - 1, -1, -1):
        cid = stack[t]
        if cid == req.container_id:
            break
        containers_above.append(cid)

    # Reshuffle: mover cada contentor acima para nova posição
    for cid in containers_above:
        above_info = yard.container_registry.get(cid)
        if not above_info or not above_info.position:
            continue

        old_pos = list(above_info.position)

        # Remove do cache temporariamente
        yard.remove_container(cid)

        # Realoca usando o otimizador
        result = allocate(yard, above_info, None, use_pso=True)
        if result is None:
            # Sem espaço — colocar de volta e abortar
            yard.place_container(above_info, old_pos[0], old_pos[1], old_pos[2])
            raise HTTPException(status_code=503, detail=f"Sem espaço para reshuffle do container {cid}.")

        # Colocar na nova posição (cache)
        yard.place_container(above_info, result.bay, result.row, result.tier)

        # Atualizar DB
        await session.execute(
            update(Container)
            .where(Container.container_id == cid, Container.is_active == True)
            .values(bay=result.bay, row=result.row, tier=result.tier)
        )

        reshuffles.append(ReshuffleMove(
            container_id=cid,
            from_position=old_pos,
            to_position=[result.bay, result.row, result.tier],
            cost_score=result.cost_score,
        ))

        logger.info(f"RESHUFFLE Container {cid}: ({old_pos[0]},{old_pos[1]},{old_pos[2]}) → ({result.bay},{result.row},{result.tier})")

    # Agora remove o contentor alvo
    removed_pos = yard.remove_container(req.container_id)

    # Marcar como inativo no DB
    await session.execute(
        update(Container)
        .where(Container.container_id == req.container_id, Container.is_active == True)
        .values(is_active=False, removed_at=now, bay=None, row=None, tier=None)
    )
    await session.commit()

    logger.info(f"RETIRADA Container {req.container_id} de ({bay},{row},{tier}) com {len(reshuffles)} reshuffles")

    yard_3d = _build_yard_3d(yard)

    return RetirarResponse(
        container_id=req.container_id,
        removed_from=[bay, row, tier],
        reshuffles=reshuffles,
        total_reshuffles=len(reshuffles),
        total_time_estimate_s=len(reshuffles) * 60 + 30,  # ~60s por reshuffle + 30s retrieval
        yard_3d=yard_3d,
        yard_stats=_build_yard_stats(yard),
        timestamp=now.isoformat(),
    )
