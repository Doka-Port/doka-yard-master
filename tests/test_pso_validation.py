"""Testes de validação do algoritmo PSO e função de custo."""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from backend.models.yard_state import ContainerInfo, YardState
from backend.services.allocator import StackingOptimizer, allocate
from backend.services.cost_function import (
    calc_distance_cost,
    calc_grouping_cost,
    calc_reshuffle_cost,
    calc_weight_cost,
    calculate_cost,
)


# ─── Helpers ───

def make_yard(bays=10, rows=4, tiers=5) -> YardState:
    return YardState(block_id=1, block_name="T1", num_bays=bays, num_rows=rows, max_tiers=tiers)


def make_container(cid=1, weight="MEDIUM", departure_days=5, flow="EXPORT") -> ContainerInfo:
    return ContainerInfo(
        container_id=cid,
        weight_class=weight,
        weight_kg=18000,
        departure_time=datetime.now(timezone.utc) + timedelta(days=departure_days),
        flow_type=flow,
        arrival_time=datetime.now(timezone.utc),
    )


# ═══════════════════════════════════════════
# 1. COST FUNCTION TESTS
# ═══════════════════════════════════════════

class TestReshuffleCost:
    def test_empty_stack_no_penalty(self):
        yard = make_yard()
        c = make_container(departure_days=5)
        assert calc_reshuffle_cost(yard, c, 0, 0, 0) == 0.0

    def test_late_on_top_of_early_penalizes(self):
        yard = make_yard()
        early = make_container(cid=1, departure_days=2)
        yard.place_container(early, 0, 0, 0)
        late = make_container(cid=2, departure_days=10)
        cost = calc_reshuffle_cost(yard, late, 0, 0, 1)
        assert cost > 0, "Placing late-departure on top of early should penalize"

    def test_early_on_top_of_late_no_penalty(self):
        yard = make_yard()
        late = make_container(cid=1, departure_days=10)
        yard.place_container(late, 0, 0, 0)
        early = make_container(cid=2, departure_days=2)
        cost = calc_reshuffle_cost(yard, early, 0, 0, 1)
        assert cost == 0.0, "Placing early-departure on top of late should not penalize"

    def test_multiple_violations_normalized(self):
        yard = make_yard()
        for i in range(3):
            c = make_container(cid=i + 1, departure_days=1 + i)
            yard.place_container(c, 0, 0, i)
        very_late = make_container(cid=10, departure_days=30)
        cost = calc_reshuffle_cost(yard, very_late, 0, 0, 3)
        assert cost == 3 / 5, "All 3 below depart earlier → 3/max_tiers(5) = 0.6"


class TestWeightCost:
    def test_base_tiers_free(self):
        c = make_container(weight="HEAVY")
        assert calc_weight_cost(c, 0, 5) == 0.0
        assert calc_weight_cost(c, 1, 5) == 0.0

    def test_heavy_high_tier_max_penalty(self):
        c = make_container(weight="HEAVY")
        cost = calc_weight_cost(c, 4, 5)
        assert cost == 0.5, "HEAVY at max tier → 0.5 * (3/3) * (4/4) = 0.5 (no stack penalty)"

    def test_light_high_tier_low_penalty(self):
        c = make_container(weight="LIGHT")
        cost = calc_weight_cost(c, 4, 5)
        assert abs(cost - 1 / 6) < 0.01, "LIGHT at max tier → 0.5 * (1/3) * (4/4) ≈ 0.167"


class TestDistanceCost:
    def test_no_rtg_zero(self):
        assert calc_distance_cost(5, 3, None, 10, 4) == 0.0

    def test_same_position_zero(self):
        assert calc_distance_cost(5, 3, (5, 3), 10, 4) == 0.0

    def test_max_distance_one(self):
        cost = calc_distance_cost(9, 3, (0, 0), 10, 4)
        assert abs(cost - 1.0) < 0.01


class TestGroupingCost:
    def test_export_low_bay_preferred(self):
        c = make_container(flow="EXPORT")
        cost_low = calc_grouping_cost(c, 0, 10)
        cost_high = calc_grouping_cost(c, 9, 10)
        assert cost_low < cost_high, "EXPORT should prefer low bays"

    def test_import_high_bay_preferred(self):
        c = make_container(flow="IMPORT")
        cost_low = calc_grouping_cost(c, 0, 10)
        cost_high = calc_grouping_cost(c, 9, 10)
        assert cost_high < cost_low, "IMPORT should prefer high bays"


class TestTotalCost:
    def test_breakdown_keys(self):
        yard = make_yard()
        c = make_container()
        _, breakdown = calculate_cost(0, 0, 0, c, yard)
        expected_keys = {
            "reshuffle_penalty", "reshuffle_weighted",
            "weight_deviation", "weight_weighted",
            "rtg_distance", "distance_weighted",
            "grouping_penalty", "grouping_weighted",
            "reefer_penalty", "reefer_weighted",
            "imo_penalty", "imo_weighted",
        }
        assert set(breakdown.keys()) == expected_keys

    def test_empty_yard_low_cost(self):
        yard = make_yard()
        c = make_container()
        cost, _ = calculate_cost(0, 0, 0, c, yard)
        assert cost < 10, "Empty yard, tier 0 should have very low cost"


# ═══════════════════════════════════════════
# 2. PSO OPTIMIZER TESTS
# ═══════════════════════════════════════════

class TestPSOOptimizer:
    def test_returns_valid_position(self):
        yard = make_yard()
        c = make_container()
        result = allocate(yard, c)
        assert result is not None
        assert 0 <= result.bay < yard.num_bays
        assert 0 <= result.row < yard.num_rows
        assert 0 <= result.tier < yard.max_tiers

    def test_empty_yard_tier_zero(self):
        yard = make_yard()
        c = make_container()
        result = allocate(yard, c)
        assert result.tier == 0, "Empty yard should allocate at ground level"

    def test_full_yard_returns_none(self):
        yard = make_yard(bays=2, rows=2, tiers=2)
        for i in range(8):
            ci = make_container(cid=i + 1)
            bay, row, tier = i // 4, (i % 4) // 2, i % 2
            yard.place_container(ci, bay, row, tier)
        c = make_container(cid=99)
        result = allocate(yard, c)
        assert result is None, "Full yard should return None"

    def test_avoids_reshuffle(self):
        """PSO should avoid placing late-departure on early-departure stacks."""
        yard = make_yard(bays=5, rows=2, tiers=5)
        # Fill bay 0 with early-departure containers
        for i in range(3):
            early = make_container(cid=i + 1, departure_days=1)
            yard.place_container(early, 0, 0, i)
        # Allocate a late-departure container
        late = make_container(cid=100, departure_days=30)
        result = allocate(yard, late)
        assert result is not None
        # Should NOT stack on bay 0, row 0 (where early-departures are)
        if result.bay == 0 and result.row == 0:
            pytest.fail("PSO placed late container on top of early-departure stack (reshuffle risk)")

    def test_heavy_prefers_low_tier(self):
        """Heavy containers should prefer lower tiers."""
        yard = make_yard(bays=5, rows=2, tiers=5)
        heavy = make_container(cid=1, weight="HEAVY")
        result = allocate(yard, heavy)
        assert result.tier == 0, "Heavy container should be placed at ground level"

    def test_pso_vs_greedy_consistency(self):
        """PSO and greedy should find similar-quality solutions on same input."""
        yard = make_yard(bays=5, rows=3, tiers=5)
        c = make_container()
        opt = StackingOptimizer()

        candidates = yard.get_valid_slots()
        greedy_result = opt._greedy(yard, c, candidates, None)
        pso_result = opt._pso(yard, c, candidates, None)

        # PSO should be at most 20% worse than greedy on empty yard
        assert pso_result.cost_score <= greedy_result.cost_score * 1.2, (
            f"PSO ({pso_result.cost_score}) significantly worse than greedy ({greedy_result.cost_score})"
        )

    def test_optimizer_type_label(self):
        """Should label as 'greedy' for small candidate sets, 'pso' for large."""
        small_yard = make_yard(bays=3, rows=2, tiers=5)
        c = make_container()
        result_small = allocate(small_yard, c)
        assert "greedy" in result_small.optimizer_type

        big_yard = make_yard(bays=10, rows=4, tiers=5)
        result_big = allocate(big_yard, c)
        assert result_big.optimizer_type == "pso"

    def test_alternatives_provided(self):
        yard = make_yard(bays=5, rows=3, tiers=5)
        c = make_container()
        result = allocate(yard, c)
        assert len(result.alternatives) > 0, "Should provide alternatives"

    def test_computation_time_reasonable(self):
        yard = make_yard(bays=30, rows=6, tiers=5)
        c = make_container()
        result = allocate(yard, c)
        assert result.computation_ms < 5000, "PSO should complete under 5 seconds"

    def test_deterministic_greedy(self):
        """Greedy should return identical results for same input."""
        yard = make_yard(bays=3, rows=2, tiers=5)
        c = make_container()
        r1 = allocate(yard, c)
        r2 = allocate(yard, c)
        assert r1.bay == r2.bay and r1.row == r2.row and r1.tier == r2.tier

    def test_export_prefers_low_bays(self):
        """EXPORT containers should prefer low bay numbers (near berth)."""
        yard = make_yard(bays=10, rows=2, tiers=5)
        export_c = make_container(flow="EXPORT")
        result = allocate(yard, export_c)
        assert result.bay < 5, f"EXPORT should prefer low bays, got bay={result.bay}"

    def test_import_prefers_high_bays(self):
        """IMPORT containers should prefer high bay numbers (near gate)."""
        yard = make_yard(bays=10, rows=2, tiers=5)
        import_c = make_container(flow="IMPORT")
        result = allocate(yard, import_c)
        assert result.bay >= 5, f"IMPORT should prefer high bays, got bay={result.bay}"


# ═══════════════════════════════════════════
# 3. INERTIA DECAY VALIDATION
# ═══════════════════════════════════════════

class TestInertiaDecay:
    def test_inertia_never_reaches_zero(self):
        """Inertia should decay to w_min=0.4, never to zero."""
        opt = StackingOptimizer()
        w_min = 0.4
        for iteration in range(opt.n_iterations):
            w = opt.w - (opt.w - w_min) * (iteration / (opt.n_iterations - 1))
            assert w >= w_min - 0.001, f"Inertia dropped below minimum at iteration {iteration}: {w}"
            assert w <= opt.w + 0.001, f"Inertia exceeded initial at iteration {iteration}: {w}"


# ═══════════════════════════════════════════
# 4. STRESS TESTS
# ═══════════════════════════════════════════

class TestStress:
    def test_sequential_allocations(self):
        """Allocate 50 containers and verify no position conflicts."""
        yard = make_yard(bays=10, rows=4, tiers=5)
        positions = set()
        for i in range(50):
            c = make_container(cid=i + 1, departure_days=1 + (i % 14))
            result = allocate(yard, c)
            assert result is not None, f"Failed to allocate container {i + 1}"
            pos = (result.bay, result.row, result.tier)
            assert pos not in positions, f"Duplicate position {pos} for container {i + 1}"
            positions.add(pos)
            yard.place_container(c, result.bay, result.row, result.tier)

    def test_high_occupancy_still_works(self):
        """At 80%+ occupancy, PSO/greedy should still find slots."""
        yard = make_yard(bays=5, rows=4, tiers=5)  # 100 slots
        for i in range(80):
            c = make_container(cid=i + 1, departure_days=1 + (i % 10))
            result = allocate(yard, c)
            assert result is not None
            yard.place_container(c, result.bay, result.row, result.tier)
        # Should still be able to allocate at 80%
        c = make_container(cid=999)
        result = allocate(yard, c)
        assert result is not None
