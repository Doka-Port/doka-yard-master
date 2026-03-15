from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.db_models import Block, Container

logger = logging.getLogger(__name__)


@dataclass
class ContainerInfo:
    container_id: int
    weight_class: str
    weight_kg: int
    departure_time: datetime
    flow_type: str
    position: tuple[int, int, int] | None = None
    arrival_time: datetime | None = None


class YardState:
    """Cache em memória do estado do pátio, apoiado por uma matriz NumPy."""

    def __init__(self, block_id: int, block_name: str, num_bays: int, num_rows: int, max_tiers: int):
        self.block_id = block_id
        self.block_name = block_name
        self.num_bays = num_bays
        self.num_rows = num_rows
        self.max_tiers = max_tiers
        self.yard_matrix: np.ndarray = np.zeros((num_bays, num_rows, max_tiers), dtype=int)
        self.container_registry: dict[int, ContainerInfo] = {}

    @property
    def total_capacity(self) -> int:
        return self.num_bays * self.num_rows * self.max_tiers

    @property
    def current_occupancy(self) -> int:
        return int(np.count_nonzero(self.yard_matrix))

    @property
    def occupancy_rate(self) -> float:
        return self.current_occupancy / self.total_capacity if self.total_capacity > 0 else 0.0

    def get_next_free_tier(self, bay: int, row: int) -> int | None:
        """Retorna o próximo tier livre numa pilha, ou None se cheia."""
        for tier in range(self.max_tiers):
            if self.yard_matrix[bay, row, tier] == 0:
                return tier
        return None

    def get_valid_slots(self) -> list[tuple[int, int, int]]:
        """Lista todos os slots válidos (próximo tier livre em cada bay/row)."""
        slots = []
        for bay in range(self.num_bays):
            for row in range(self.num_rows):
                tier = self.get_next_free_tier(bay, row)
                if tier is not None:
                    slots.append((bay, row, tier))
        return slots

    def get_stack(self, bay: int, row: int) -> list[int]:
        """Retorna os container_ids na pilha (bay, row), de baixo para cima."""
        stack = []
        for tier in range(self.max_tiers):
            cid = self.yard_matrix[bay, row, tier]
            if cid == 0:
                break
            stack.append(int(cid))
        return stack

    def place_container(self, container_info: ContainerInfo, bay: int, row: int, tier: int):
        """Coloca um contentor no cache."""
        self.yard_matrix[bay, row, tier] = container_info.container_id
        container_info.position = (bay, row, tier)
        self.container_registry[container_info.container_id] = container_info
        logger.info(f"Container {container_info.container_id} → ({bay},{row},{tier})")

    def remove_container(self, container_id: int) -> tuple[int, int, int] | None:
        """Remove um contentor do cache."""
        info = self.container_registry.pop(container_id, None)
        if info and info.position:
            bay, row, tier = info.position
            self.yard_matrix[bay, row, tier] = 0
            return (bay, row, tier)
        return None

    def get_heatmap(self) -> list[list[float]]:
        """Heatmap de ocupação por bay×row (0.0 = vazio, 1.0 = cheio)."""
        heatmap = []
        for bay in range(self.num_bays):
            row_data = []
            for row in range(self.num_rows):
                occupied = sum(1 for t in range(self.max_tiers) if self.yard_matrix[bay, row, t] != 0)
                row_data.append(round(occupied / self.max_tiers, 2))
            heatmap.append(row_data)
        return heatmap

    @classmethod
    async def rebuild_from_db(cls, session: AsyncSession, block: Block) -> YardState:
        """Reconstrói o cache a partir do PostgreSQL."""
        state = cls(
            block_id=block.id,
            block_name=block.block_name,
            num_bays=block.num_bays,
            num_rows=block.num_rows,
            max_tiers=block.max_tiers,
        )

        result = await session.execute(
            select(Container).where(
                Container.block_id == block.id,
                Container.is_active == True,
                Container.bay.isnot(None),
            )
        )
        containers = result.scalars().all()

        for c in containers:
            info = ContainerInfo(
                container_id=c.container_id,
                weight_class=c.weight_class,
                weight_kg=c.weight_kg,
                departure_time=c.departure_time,
                flow_type=c.flow_type,
                position=(c.bay, c.row, c.tier),
                arrival_time=c.arrival_time,
            )
            state.yard_matrix[c.bay, c.row, c.tier] = c.container_id
            state.container_registry[c.container_id] = info

        logger.info(f"Cache rebuilt for block {block.block_name}: {state.current_occupancy} containers")
        return state
