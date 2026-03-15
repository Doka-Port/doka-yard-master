"""Função de custo para alocação de contentores.

Cost = (Digging * 100) + (Weight * 10) + (Grouping * 5) + (Distance * 1)

Os pesos agressivos garantem que o demo mostra inteligência:
- Digging (re-handling) domina completamente a decisão
- Peso é um critério forte mas secundário
- Grouping (EXPORT/IMPORT) influencia a separação por fluxo
- Distância é um tiebreaker
"""

from backend.config import WEIGHT_RESHUFFLE, WEIGHT_GRAVITY, WEIGHT_DISTANCE, WEIGHT_GROUPING
from backend.models.yard_state import YardState, ContainerInfo

WEIGHT_MAP = {"LIGHT": 1, "MEDIUM": 2, "HEAVY": 3}

# ─── Pesos da função de custo (derivados do config, escalados) ───
# Escala: normaliza os pesos de config (somam 1.0) para magnitudes com hierarquia clara
_SCALE = 100.0
PENALTY_DIGGING = WEIGHT_RESHUFFLE * _SCALE * 2    # 0.50 * 200 = 100.0
PENALTY_WEIGHT = WEIGHT_GRAVITY * _SCALE * 0.4     # 0.25 * 40  = 10.0
PENALTY_DISTANCE = WEIGHT_DISTANCE * _SCALE * 0.067  # 0.15 * 6.7 = ~1.0
PENALTY_GROUPING = WEIGHT_GROUPING * _SCALE * 0.5   # 0.10 * 50  = 5.0


def calc_reshuffle_cost(
    yard: YardState, container: ContainerInfo, bay: int, row: int, tier: int
) -> float:
    """Penaliza colocar um contentor que sai tarde em cima de um que sai cedo.

    Cada violação conta como 1.0 — com o peso PENALTY_DIGGING=100,
    uma única violação torna esta posição quase inutilizável.
    """
    stack = yard.get_stack(bay, row)
    if not stack:
        return 0.0

    violations = 0
    for cid in stack:
        below = yard.container_registry.get(cid)
        if below and container.departure_time > below.departure_time:
            violations += 1

    # Normalizado pelo max_tiers para penalizar mais violações em pilhas altas
    return violations / yard.max_tiers


def calc_weight_cost(
    container: ContainerInfo, tier: int, max_tiers: int,
    yard: YardState | None = None, bay: int = 0, row: int = 0,
) -> float:
    """Penaliza contentores pesados em tiers altos e heavy-on-light.

    Combina duas penalidades:
    - height_penalty: peso do container × altura relativa
    - stacking_penalty: colocar pesado sobre leve (violação estrutural)
    """
    w = WEIGHT_MAP.get(container.weight_class, 2)

    # Penalidade por altura (containers pesados em tiers altos)
    if tier <= 1 or max_tiers <= 1:
        height_penalty = 0.0
    else:
        height_penalty = (w / 3) * (tier / (max_tiers - 1))

    # Penalidade por empilhamento: pesado sobre leve
    stacking_penalty = 0.0
    if yard is not None:
        stack = yard.get_stack(bay, row)
        if stack:
            violations = 0
            for cid in stack:
                below = yard.container_registry.get(cid)
                if below:
                    below_w = WEIGHT_MAP.get(below.weight_class, 2)
                    if w > below_w:
                        violations += 1
            stacking_penalty = violations / max(len(stack), 1)

    return 0.5 * height_penalty + 0.5 * stacking_penalty


def calc_distance_cost(
    bay: int, row: int, rtg_position: tuple[int, int] | None, num_bays: int, num_rows: int
) -> float:
    """Distância Manhattan normalizada do RTG à posição candidata."""
    if rtg_position is None:
        return 0.0
    max_dist = (num_bays - 1) + (num_rows - 1)
    if max_dist == 0:
        return 0.0
    dist = abs(bay - rtg_position[0]) + abs(row - rtg_position[1])
    return dist / max_dist


def calc_grouping_cost(container: ContainerInfo, bay: int, num_bays: int) -> float:
    """EXPORT → bays baixas (perto do berth). IMPORT → bays altas (perto do gate)."""
    if num_bays <= 1:
        return 0.0
    ratio = bay / (num_bays - 1)
    if container.flow_type == "EXPORT":
        return ratio
    else:
        return 1.0 - ratio


PENALTY_REEFER = 80.0   # Strong: reefer must go to reefer slot
PENALTY_IMO = 60.0      # Strong: IMO segregation

# IMO incompatibility: classes that must NOT be adjacent
IMO_INCOMPATIBLE = {
    ("1", "2"), ("1", "3"), ("1", "6"), ("1", "7"),
    ("2", "3"), ("2", "6"), ("3", "4"), ("3", "6"),
    ("4", "6"), ("4", "7"), ("5", "6"), ("6", "7"),
}


def calc_reefer_cost(
    container: ContainerInfo, bay: int, row: int, yard: YardState
) -> float:
    """Reefer containers should go to reefer slots; non-reefers should avoid them."""
    is_reefer_slot = (bay, row) in yard.reefer_slots
    if container.is_reefer:
        return 0.0 if is_reefer_slot else 1.0
    else:
        return 0.3 if is_reefer_slot else 0.0


def calc_imo_cost(
    container: ContainerInfo, bay: int, row: int, yard: YardState
) -> float:
    """Penalizes placing IMO containers adjacent to incompatible IMO classes."""
    if not container.imo_class:
        return 0.0

    violations = 0
    checks = 0
    for db, dr in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nb, nr = bay + db, row + dr
        if 0 <= nb < yard.num_bays and 0 <= nr < yard.num_rows:
            stack = yard.get_stack(nb, nr)
            for cid in stack:
                info = yard.container_registry.get(cid)
                if info and info.imo_class:
                    checks += 1
                    pair = tuple(sorted([container.imo_class, info.imo_class]))
                    if pair in IMO_INCOMPATIBLE:
                        violations += 1
    return violations / max(checks, 1)


def calculate_cost(
    bay: int,
    row: int,
    tier: int,
    container_info: ContainerInfo,
    yard_state: YardState,
    rtg_position: tuple[int, int] | None = None,
) -> tuple[float, dict]:
    """Calcula o custo total usando pesos agressivos para o demo.

    Cost = (Digging * 100) + (Weight * 10) + (Grouping * 5) + (Distance * 1)

    Args:
        bay, row, tier: posição candidata
        container_info: dados do contentor a alocar
        yard_state: estado actual do pátio
        rtg_position: posição actual do RTG (bay, row)

    Returns:
        (cost_total, breakdown_dict)
    """
    c_reshuffle = calc_reshuffle_cost(yard_state, container_info, bay, row, tier)
    c_weight = calc_weight_cost(container_info, tier, yard_state.max_tiers, yard_state, bay, row)
    c_distance = calc_distance_cost(bay, row, rtg_position, yard_state.num_bays, yard_state.num_rows)
    c_grouping = calc_grouping_cost(container_info, bay, yard_state.num_bays)
    c_reefer = calc_reefer_cost(container_info, bay, row, yard_state)
    c_imo = calc_imo_cost(container_info, bay, row, yard_state)

    total = (
        PENALTY_DIGGING * c_reshuffle
        + PENALTY_WEIGHT * c_weight
        + PENALTY_DISTANCE * c_distance
        + PENALTY_GROUPING * c_grouping
        + PENALTY_REEFER * c_reefer
        + PENALTY_IMO * c_imo
    )

    breakdown = {
        "reshuffle_penalty": round(c_reshuffle, 4),
        "reshuffle_weighted": round(PENALTY_DIGGING * c_reshuffle, 2),
        "weight_deviation": round(c_weight, 4),
        "weight_weighted": round(PENALTY_WEIGHT * c_weight, 2),
        "rtg_distance": round(c_distance, 4),
        "distance_weighted": round(PENALTY_DISTANCE * c_distance, 2),
        "grouping_penalty": round(c_grouping, 4),
        "grouping_weighted": round(PENALTY_GROUPING * c_grouping, 2),
        "reefer_penalty": round(c_reefer, 4),
        "reefer_weighted": round(PENALTY_REEFER * c_reefer, 2),
        "imo_penalty": round(c_imo, 4),
        "imo_weighted": round(PENALTY_IMO * c_imo, 2),
    }

    return round(total, 4), breakdown


# ─── Backward-compatible alias ───
def calculate_total_cost(
    yard: YardState,
    container: ContainerInfo,
    bay: int,
    row: int,
    tier: int,
    rtg_position: tuple[int, int] | None = None,
) -> tuple[float, dict]:
    """Alias para manter compatibilidade com o allocator existente."""
    return calculate_cost(bay, row, tier, container, yard, rtg_position)
