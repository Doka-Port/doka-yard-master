"""Motor de otimização: StackingOptimizer com PSO + Greedy fallback."""

import logging
import time
from dataclasses import dataclass

import numpy as np

from backend.config import (
    PSO_C1, PSO_C2, PSO_ITERATIONS, PSO_PARTICLES, PSO_USE_GREEDY_THRESHOLD, PSO_W,
)
from backend.models.yard_state import ContainerInfo, YardState
from backend.services.cost_function import calculate_cost

logger = logging.getLogger(__name__)


@dataclass
class PSOIterationData:
    """Dados de uma iteração PSO para visualização."""
    iteration: int
    particles: list[list[float]]  # [[bay, row], ...] posições contínuas
    particles_discrete: list[list[int]]  # [[bay, row, tier], ...] snapped
    particle_scores: list[float]
    g_best_position: list[float]
    g_best_score: float
    inertia: float


@dataclass
class AllocationResult:
    bay: int
    row: int
    tier: int
    cost_score: float
    cost_breakdown: dict
    alternatives: list[dict]
    optimizer_type: str
    computation_ms: int
    pso_history: list[PSOIterationData] | None = None


class StackingOptimizer:
    """Motor de otimização PSO para empilhamento de contentores.

    Implementa Particle Swarm Optimization num espaço 2D contínuo (bay, row),
    com snap discreto para slots válidos. O tier é determinístico (próximo livre).

    Hiperparâmetros:
        n_particles: número de partículas no enxame
        n_iterations: iterações do PSO
        c1 (cognitivo): peso da melhor posição pessoal
        c2 (social): peso da melhor posição global
        w (inércia): decai linearmente ao longo das iterações
    """

    def __init__(
        self,
        n_particles: int = PSO_PARTICLES,
        n_iterations: int = PSO_ITERATIONS,
        c1: float = PSO_C1,
        c2: float = PSO_C2,
        w: float = PSO_W,
        greedy_threshold: int = PSO_USE_GREEDY_THRESHOLD,
    ):
        self.n_particles = n_particles
        self.n_iterations = n_iterations
        self.c1 = c1
        self.c2 = c2
        self.w = w
        self.greedy_threshold = greedy_threshold
        self.rng = np.random.default_rng()

    def optimize(
        self,
        yard: YardState,
        container: ContainerInfo,
        rtg_position: tuple[int, int] | None = None,
        use_pso: bool = True,
        excluded_columns: set[tuple[int, int]] | None = None,
    ) -> AllocationResult | None:
        """Ponto de entrada: decide entre greedy e PSO automaticamente."""
        candidates = yard.get_valid_slots(excluded_columns=excluded_columns)

        if not candidates:
            return None

        if not use_pso or len(candidates) <= self.greedy_threshold:
            return self._greedy(yard, container, candidates, rtg_position)

        return self._pso(yard, container, candidates, rtg_position)

    def _greedy(
        self,
        yard: YardState,
        container: ContainerInfo,
        candidates: list[tuple[int, int, int]],
        rtg_position: tuple[int, int] | None,
    ) -> AllocationResult:
        """Força bruta: avalia todos os candidatos e retorna o melhor."""
        start = time.perf_counter_ns()

        scored = []
        for bay, row, tier in candidates:
            cost, breakdown = calculate_cost(bay, row, tier, container, yard, rtg_position)
            scored.append((cost, breakdown, (bay, row, tier)))
        scored.sort(key=lambda x: x[0])

        best_cost, best_breakdown, best_pos = scored[0]
        alternatives = [
            {"position": list(pos), "score": round(cost, 4)}
            for cost, _, pos in scored[1:4]
        ]

        elapsed_ms = int((time.perf_counter_ns() - start) / 1_000_000)

        return AllocationResult(
            bay=best_pos[0],
            row=best_pos[1],
            tier=best_pos[2],
            cost_score=best_cost,
            cost_breakdown=best_breakdown,
            alternatives=alternatives,
            optimizer_type="greedy" if len(scored) <= self.greedy_threshold else "greedy (few candidates)",
            computation_ms=elapsed_ms,
        )

    def _pso(
        self,
        yard: YardState,
        container: ContainerInfo,
        candidates: list[tuple[int, int, int]],
        rtg_position: tuple[int, int] | None,
    ) -> AllocationResult:
        """PSO: explora o espaço de soluções com partículas.

        O espaço de busca é 2D contínuo (bay, row). Em cada iteração,
        cada partícula é snapped ao candidato válido mais próximo e avaliada.
        """
        start = time.perf_counter_ns()

        n_particles = max(2, min(self.n_particles, len(candidates)))
        candidate_arr = np.array(candidates, dtype=float)  # Nx3

        bay_bounds = (0.0, float(yard.num_bays - 1))
        row_bounds = (0.0, float(yard.num_rows - 1))

        # Inicializar partículas aleatoriamente no espaço contínuo
        positions = np.column_stack([
            self.rng.uniform(bay_bounds[0], bay_bounds[1], n_particles),
            self.rng.uniform(row_bounds[0], row_bounds[1], n_particles),
        ])
        velocities = np.zeros_like(positions)

        p_best_pos = positions.copy()
        p_best_scores = np.full(n_particles, np.inf)
        g_best_pos = positions[0].copy()
        g_best_score = np.inf
        g_best_discrete = candidates[0]
        g_best_breakdown: dict = {}

        # Cache de scores já calculados (evita recálculos)
        score_cache: dict[tuple[int, int, int], tuple[float, dict]] = {}
        pso_history: list[PSOIterationData] = []

        for iteration in range(self.n_iterations):
            # Inércia decrescente: decai de w_max (0.7) até w_min (0.4)
            w_min = 0.4
            w = self.w - (self.w - w_min) * (iteration / (self.n_iterations - 1))

            iter_discrete: list[list[int]] = []
            iter_scores: list[float] = []

            for i in range(n_particles):
                # Snap para o candidato válido mais próximo (Manhattan distance)
                dists = np.abs(candidate_arr[:, 0] - positions[i, 0]) + np.abs(candidate_arr[:, 1] - positions[i, 1])
                idx = int(np.argmin(dists))
                discrete = candidates[idx]

                # Avaliar custo (com cache)
                if discrete not in score_cache:
                    cost, breakdown = calculate_cost(
                        discrete[0], discrete[1], discrete[2],
                        container, yard, rtg_position,
                    )
                    score_cache[discrete] = (cost, breakdown)

                cost, breakdown = score_cache[discrete]
                iter_discrete.append(list(discrete))
                iter_scores.append(round(cost, 4))

                # Atualizar melhor pessoal
                if cost < p_best_scores[i]:
                    p_best_scores[i] = cost
                    p_best_pos[i] = positions[i].copy()

                # Atualizar melhor global
                if cost < g_best_score:
                    g_best_score = cost
                    g_best_pos = positions[i].copy()
                    g_best_discrete = discrete
                    g_best_breakdown = breakdown

            # Registrar dados da iteração para visualização
            pso_history.append(PSOIterationData(
                iteration=iteration,
                particles=positions.round(2).tolist(),
                particles_discrete=iter_discrete,
                particle_scores=iter_scores,
                g_best_position=[round(g_best_pos[0], 2), round(g_best_pos[1], 2)],
                g_best_score=round(g_best_score, 4),
                inertia=round(w, 4),
            ))

            # Atualizar velocidades e posições (equações canónicas do PSO)
            r1 = self.rng.random((n_particles, 2))
            r2 = self.rng.random((n_particles, 2))
            velocities = (
                w * velocities
                + self.c1 * r1 * (p_best_pos - positions)
                + self.c2 * r2 * (g_best_pos - positions)
            )
            positions = positions + velocities

            # Clamp aos limites do pátio
            positions[:, 0] = np.clip(positions[:, 0], bay_bounds[0], bay_bounds[1])
            positions[:, 1] = np.clip(positions[:, 1], row_bounds[0], row_bounds[1])

        # Construir alternativas: top 3 dos scores conhecidos (excluindo o melhor)
        sorted_scored = sorted(score_cache.items(), key=lambda x: x[1][0])
        alternatives = [
            {"position": list(pos), "score": round(cost, 4)}
            for pos, (cost, _) in sorted_scored[1:4]
        ]

        elapsed_ms = int((time.perf_counter_ns() - start) / 1_000_000)

        logger.info(
            f"PSO complete: {self.n_iterations} iters, {len(score_cache)} unique positions evaluated, "
            f"best={g_best_score:.4f} at {g_best_discrete}, {elapsed_ms}ms"
        )

        return AllocationResult(
            bay=g_best_discrete[0],
            row=g_best_discrete[1],
            tier=g_best_discrete[2],
            cost_score=round(g_best_score, 4),
            cost_breakdown=g_best_breakdown,
            alternatives=alternatives,
            optimizer_type="pso",
            computation_ms=elapsed_ms,
            pso_history=pso_history,
        )


def allocate(
    yard: YardState,
    container: ContainerInfo,
    rtg_position: tuple[int, int] | None = None,
    use_pso: bool = True,
    excluded_columns: set[tuple[int, int]] | None = None,
) -> AllocationResult | None:
    """Ponto de entrada público. Backward-compatible."""
    optimizer = StackingOptimizer()
    return optimizer.optimize(yard, container, rtg_position, use_pso=use_pso, excluded_columns=excluded_columns)
