"""Gerador de missões RTG (Work Orders)."""

from datetime import datetime, timezone

from backend.config import RTG_LIFT_TIME, RTG_LOCK_TIME, RTG_LOWER_PER_TIER, RTG_MOVE_PER_BAY, RTG_MOVE_PER_ROW
from backend.models.yard_state import YardState


def generate_place_mission(
    container_id: int,
    bay: int,
    row: int,
    tier: int,
    rtg_position: tuple[int, int] | None = None,
) -> dict:
    """Gera uma missão PLACE para o RTG."""
    now = datetime.now(timezone.utc)
    mission_id = f"WO-{now.strftime('%Y%m%d')}-{container_id:04d}"

    rtg_pos = rtg_position or (0, 0)
    target = [bay, row, tier]

    # Calcular tempos
    move_time = abs(bay - rtg_pos[0]) * RTG_MOVE_PER_BAY + abs(row - rtg_pos[1]) * RTG_MOVE_PER_ROW
    lower_time = (tier + 1) * RTG_LOWER_PER_TIER

    steps = [
        {"action": "MOVE_TO", "target": target, "duration_s": max(move_time, 1)},
        {"action": "LOWER_SPREADER", "target": target, "duration_s": lower_time},
        {"action": "UNLOCK", "target": target, "duration_s": RTG_LOCK_TIME},
        {"action": "RELEASE", "target": target, "duration_s": RTG_LIFT_TIME},
        {"action": "LIFT_SPREADER", "target": target, "duration_s": lower_time},
    ]

    total_time = sum(s["duration_s"] for s in steps)

    return {
        "mission_id": mission_id,
        "mission_type": "PLACE",
        "container_id": container_id,
        "steps": steps,
        "total_estimated_time_s": total_time,
        "rtg_start_position": list(rtg_pos),
        "rtg_end_position": [bay, row],
    }


def generate_retrieve_mission(
    yard: YardState,
    container_id: int,
    rtg_position: tuple[int, int] | None = None,
) -> dict | None:
    """Gera uma missão RETRIEVE para o RTG, incluindo reshuffles se necessário."""
    info = yard.container_registry.get(container_id)
    if not info or not info.position:
        return None

    bay, row, tier = info.position
    rtg_pos = rtg_position or (0, 0)
    target = [bay, row, tier]

    move_time = abs(bay - rtg_pos[0]) * RTG_MOVE_PER_BAY + abs(row - rtg_pos[1]) * RTG_MOVE_PER_ROW
    lower_time = (tier + 1) * RTG_LOWER_PER_TIER

    steps = [
        {"action": "MOVE_TO", "target": target, "duration_s": max(move_time, 1)},
        {"action": "LOWER_SPREADER", "target": target, "duration_s": lower_time},
        {"action": "LOCK", "target": target, "duration_s": RTG_LOCK_TIME},
        {"action": "LIFT", "target": target, "duration_s": lower_time},
    ]

    total_time = sum(s["duration_s"] for s in steps)

    now = datetime.now(timezone.utc)
    mission_id = f"WO-{now.strftime('%Y%m%d')}-R{container_id:04d}"

    return {
        "mission_id": mission_id,
        "mission_type": "RETRIEVE",
        "container_id": container_id,
        "steps": steps,
        "total_estimated_time_s": total_time,
        "rtg_start_position": list(rtg_pos),
        "rtg_end_position": [bay, row],
    }
