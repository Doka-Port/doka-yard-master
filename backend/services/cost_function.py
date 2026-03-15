"""Função de custo para alocação de contentores.

Cost = (Penalty_Digging * 100) + (Penalty_Weight * 10) + (Distance * 1)

Os pesos agressivos garantem que o demo mostra inteligência:
- Digging (re-handling) domina completamente a decisão
- Peso é um critério forte mas secundário
- Distância é um tiebreaker
"""

from backend.config import WEIGHT_RESHUFFLE, WEIGHT_GRAVITY, WEIGHT_DISTANCE, WEIGHT_GROUPING
from backend.models.yard_state import YardState, ContainerInfo

WEIGHT_MAP = {"LIGHT": 1, "MEDIUM": 2, "HEAVY": 3}

# ─── Pesos agressivos para o demo (Cost = Digging*100 + Weight*10 + Distance*1) ───
PENALTY_DIGGING = 100.0
PENALTY_WEIGHT = 10.0
PENALTY_DISTANCE = 1.0


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

    # Normalizado pelo tamanho da pilha para comparar pilhas de alturas diferentes
    return violations / len(stack)


def calc_weight_cost(container: ContainerInfo, tier: int, max_tiers: int) -> float:
    """Penaliza contentores pesados em tiers altos.

    HEAVY no tier 4 → 1.0 (penalização máxima)
    LIGHT no tier 4 → 0.33
    Qualquer coisa no tier 0-1 → 0.0
    """
    if tier <= 1:
        return 0.0
    w = WEIGHT_MAP.get(container.weight_class, 2)
    return (w / 3) * (tier / (max_tiers - 1)) if max_tiers > 1 else 0.0


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


def calculate_cost(
    bay: int,
    row: int,
    tier: int,
    container_info: ContainerInfo,
    yard_state: YardState,
    rtg_position: tuple[int, int] | None = None,
) -> tuple[float, dict]:
    """Calcula o custo total usando pesos agressivos para o demo.

    Cost = (Digging * 100) + (Weight * 10) + (Distance * 1)

    Args:
        bay, row, tier: posição candidata
        container_info: dados do contentor a alocar
        yard_state: estado actual do pátio
        rtg_position: posição actual do RTG (bay, row)

    Returns:
        (cost_total, breakdown_dict)
    """
    c_reshuffle = calc_reshuffle_cost(yard_state, container_info, bay, row, tier)
    c_weight = calc_weight_cost(container_info, tier, yard_state.max_tiers)
    c_distance = calc_distance_cost(bay, row, rtg_position, yard_state.num_bays, yard_state.num_rows)
    c_grouping = calc_grouping_cost(container_info, bay, yard_state.num_bays)

    total = (
        PENALTY_DIGGING * c_reshuffle
        + PENALTY_WEIGHT * c_weight
        + PENALTY_DISTANCE * c_distance
    )

    breakdown = {
        "reshuffle_penalty": round(c_reshuffle, 4),
        "reshuffle_weighted": round(PENALTY_DIGGING * c_reshuffle, 2),
        "weight_deviation": round(c_weight, 4),
        "weight_weighted": round(PENALTY_WEIGHT * c_weight, 2),
        "rtg_distance": round(c_distance, 4),
        "distance_weighted": round(PENALTY_DISTANCE * c_distance, 2),
        "grouping_penalty": round(c_grouping, 4),
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
