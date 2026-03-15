# CLAUDE.md — Development Guide

## 🚀 Build & Run Commands

### Back-end (Python / FastAPI)
- **Install dependencies**: `pip install -r requirements.txt`
- **Configuration**: The project uses SQLite by default (`yard_optimizer.db`), but supports PostgreSQL via `.env`.
- **Run server (Dev)**: `uvicorn backend.main:app --reload`
- **Seed database**: `python scripts/seed_yard.py`
- **Docker Environment**: `docker-compose up -d` (To use PostgreSQL)
- **DB Reset** (after schema changes): delete `yard_optimizer.db` and restart server.

### Front-end (React / Vite / Three.js)
- **Directory**: `cd frontend-3d`
- **Install dependencies**: `pnpm install` or `npm install`
- **Run server (Dev)**: `pnpm dev` or `npm run dev`
- **Build**: `pnpm build`
- **Type check**: `npx tsc --noEmit`

---

## 🧪 Testing Commands
- **Run all tests**: `python3 -m pytest tests/ -v`
- **Specific tests**: `python3 -m pytest tests/test_pso_validation.py`
- **Current test count**: 29 tests

---

## 🛠 Style Guidelines & Conventions

### Back-end (FastAPI / Python)
- **Typing**: Use **Type Hints** and **Pydantic** models for all requests/responses.
- **Async**: Use `async/await` for I/O operations (Database, API calls).
- **ORM**: SQLAlchemy 2.0 with asynchronous extensions (`asyncpg`).
- **Performance**: Optimizer uses **NumPy** for high-performance matrix calculations.
- **Project Structure**:
    - `backend/routers/`: API endpoints (`gate.py`, `patio.py`, `otimizador.py`, `rtg.py`).
    - `backend/services/`: Business logic (PSO Optimizer, Cost Function).
    - `backend/models/`: DB Models (`db_models.py`), Pydantic Schemas (`schemas.py`), Memory cache (`yard_state.py`).

### Front-end (TypeScript / React)
- **Framework**: Vite + React + @react-three/fiber + drei.
- **Visualization**: **Three.js** for 3D container yard rendering.
- **Styling**: Vanilla CSS with Doka design tokens (see `index.css` for palette).
- **Components**:
    - `YardScene.tsx`: 3D canvas, camera, lighting, scene composition.
    - `ContainerBox.tsx`: Individual container with 3-phase animation (lift/move/drop), X-ray, time travel effects.
    - `YardFloor.tsx`: Grid, labels, heatmap overlay, reefer slot markers.
    - `RTGCrane.tsx`: 3D gantry crane with trolley, cables, and spreader animation.
    - `ControlPanel.tsx`: Floating controls for gate-in/removal.
    - `PSOVisualizer.tsx`: PSO algorithm scatter plot + convergence chart.
    - `TimelineSlider.tsx`: Time travel slider (0-48h).
    - `MiniMap.tsx`: Multi-block navigation widget.
    - `AnalyticsSidebar.tsx`: Efficiency metrics dashboard.
- **Hook**: `useYard.ts` — central state management, API calls, animation orchestration.
- **Types**: `types/api.ts` — TypeScript interfaces matching backend Pydantic models.

---

## 🏗 System Architecture

1. **Dual-Layer Data**:
    - **PostgreSQL/SQLite**: Source of Truth (Persistence).
    - **NumPy Cache**: 3D Matrix `(Bays, Rows, Tiers)` in memory for instantaneous PSO calculations.
2. **PSO Optimizer (Particle Swarm Optimization)**:
    - Minimizes a multi-objective **Cost Function** (6 components):
        - `C_reshuffle` (weight 100): Minimizes unnecessary future movements.
        - `C_weight` (weight 10): Ensures heavy containers stay at the base.
        - `C_reefer` (weight 80): Reefer containers must go to reefer-equipped slots.
        - `C_imo` (weight 60): IMO segregation — incompatible hazard classes cannot be adjacent.
        - `C_grouping` (weight 5): Groups containers by flow (Export/Import).
        - `C_distance` (weight 1): Minimizes RTG displacement (tiebreaker).
    - Hybrid: Greedy for ≤30 candidates, PSO for larger search spaces.
3. **Write-Through**: Yard state updates are first committed to the DB and then replicated to the memory cache.
4. **RTG Crane**: Mission generation with step-by-step timing; 3D crane animates in sync with container operations.

---

## 🎯 Feature Set

### Visualização Operacional
- **RTG Crane 3D**: Gantry crane model that moves between bays, trolley slides along rows, spreader descends with cables.
- **Container Animations**: 3-phase lift/move/drop with labels and glow rings.

### Analytics & Inteligência
- **Heatmap Mode**: Floor cells colored green→red by stack occupancy (toggle in topbar).
- **Analytics Sidebar**: Allocations, removals, avg cost, occupancy bar chart (pulls from `GET /api/v1/patio/analytics`).

### Pesquisa & Foco
- **Container Search**: Type ID in topbar → camera smooth-zooms to container with highlight.
- **X-Ray Mode**: Toggle to fade non-ground containers (tier > 0 → 8% opacity), revealing stack bases.

### Restrições Operacionais
- **Reefer Areas**: Bays 0-4, Rows 0-1 have reefer outlets (blue ❄ markers on floor). PSO penalizes misplaced reefers.
- **IMO Segregation**: Incompatibility matrix for hazard classes 1-9. ⚠ icons on IMO containers.
- **Fields**: `is_reefer: bool`, `imo_class: str | None` on Container model and all API schemas.

### Time Travel
- **Timeline Slider**: 0-48h slider; containers near departure pulse red with emissive glow. Departed containers fade.

### Multi-Block
- **MiniMap**: Block selector (A1/A2/B1/B2/C1/C2) in top-left. Backend already supports `block_name` on all endpoints.

---

## 📡 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/patio/inicializar` | Initialize/reset yard block |
| GET | `/api/v1/patio/estado` | Full yard snapshot (containers, heatmap, reefer_slots) |
| GET | `/api/v1/patio/analytics` | Efficiency metrics (allocations, costs, removals) |
| POST | `/api/v1/gate-in` | Allocate container (PSO) with 3D response |
| POST | `/api/v1/retirar` | Remove container with reshuffle sequence |
| POST | `/api/v1/otimizador/alocacao` | Allocate (non-3D response) |
| GET | `/api/v1/rtg/missao` | Generate RTG mission with steps/timing |
| GET | `/api/v1/health` | Health check |

---

## 📌 Useful Links
- **API Documentation (Swagger)**: `http://localhost:8000/docs`
- **Front-end Dashboard**: `http://localhost:5173` (or Vite's default port)
