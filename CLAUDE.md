# CLAUDE.md — Development Guide

## 🚀 Build & Run Commands

### Back-end (Python / FastAPI)
- **Install dependencies**: `pip install -r requirements.txt`
- **Configuration**: The project uses SQLite by default (`yard_optimizer.db`), but supports PostgreSQL via `.env`.
- **Run server (Dev)**: `uvicorn backend.main:app --reload`
- **Seed database**: `python scripts/seed_yard.py`
- **Docker Environment**: `docker-compose up -d` (To use PostgreSQL)

### Front-end (React / Vite / Three.js)
- **Directory**: `cd frontend-3d`
- **Install dependencies**: `pnpm install` or `npm install`
- **Run server (Dev)**: `pnpm dev` or `npm run dev`
- **Build**: `pnpm build`

---

## 🧪 Testing Commands
- **Run all tests**: `pytest`
- **Specific tests**: `pytest tests/test_cost_function.py`
- **Tests with error logs**: `pytest -v`

---

## 🛠 Style Guidelines & Conventions

### Back-end (FastAPI / Python)
- **Typing**: Use **Type Hints** and **Pydantic** models for all requests/responses.
- **Async**: Use `async/await` for I/O operations (Database, API calls).
- **ORM**: SQLAlchemy 2.0 with asynchronous extensions (`asyncpg`).
- **Performance**: Optimizer uses **NumPy** for high-performance matrix calculations.
- **Project Structure**:
    - `backend/routers/`: API endpoints.
    - `backend/services/`: Business logic (PSO Optimizer, Cost Function).
    - `backend/models/`: DB Models and Pydantic Schemas.
    - `backend/models/yard_state.py`: Memory cache management (NumPy).

### Front-end (TypeScript / React)
- **Framework**: Vite + React.
- **Visualization**: **Three.js** for 3D container yard rendering.
- **Styling**: Vanilla CSS or Tailwind (if available).

---

## 🏗 System Architecture

1. **Dual-Layer Data**:
    - **PostgreSQL/SQLite**: Source of Truth (Persistence).
    - **NumPy Cache**: 3D Matrix `(Bays, Rows, Tiers)` in memory for instantaneous PSO calculations.
2. **PSO Optimizer (Particle Swarm Optimization)**:
    - Minimizes a multi-objective **Cost Function**:
        - `C_reshuffle`: Minimizes unnecessary future movements (reshuffles).
        - `C_weight`: Ensures heavy containers stay at the base.
        - `C_distance`: Minimizes RTG (crane) displacement.
        - `C_grouping`: Groups containers by flow (Export/Import).
3. **Write-Through**: Yard state updates are first committed to the DB and then replicated to the memory cache.

---

## 📌 Useful Links
- **API Documentation (Swagger)**: `http://localhost:8000/docs`
- **Front-end Dashboard**: `http://localhost:5173` (or Vite's default port)