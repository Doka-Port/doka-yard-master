from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


# ─── Patio ───

class InitializeRequest(BaseModel):
    num_bays: int = Field(30, ge=1, le=100, examples=[30])
    num_rows: int = Field(6, ge=1, le=20, examples=[6])
    max_tiers: int = Field(5, ge=1, le=10, examples=[5])
    block_name: str = Field(..., min_length=1, max_length=10, examples=["A1"])

    model_config = {"json_schema_extra": {"examples": [{"num_bays": 30, "num_rows": 6, "max_tiers": 5, "block_name": "A1"}]}}


class InitializeResponse(BaseModel):
    status: str
    block_name: str
    dimensions: dict
    total_capacity: int
    current_occupancy: int


# ─── Otimizador ───

class AllocationRequest(BaseModel):
    container_id: int = Field(..., examples=[1042])
    weight_class: str = Field(..., pattern="^(LIGHT|MEDIUM|HEAVY)$", examples=["HEAVY"])
    weight_kg: int = Field(..., ge=0, le=50000, examples=[28000])
    departure_time: datetime = Field(..., examples=["2026-03-18T14:00:00Z"])
    flow_type: str = Field(..., pattern="^(IMPORT|EXPORT)$", examples=["EXPORT"])
    rtg_position: Optional[list[int]] = Field(None, examples=[[12, 3]])

    model_config = {"json_schema_extra": {"examples": [{"container_id": 1042, "weight_class": "HEAVY", "weight_kg": 28000, "departure_time": "2026-03-18T14:00:00Z", "flow_type": "EXPORT", "rtg_position": [12, 3]}]}}


class AllocationResponse(BaseModel):
    container_id: int
    assigned_position: list[int]
    cost_score: float
    cost_breakdown: dict
    alternatives: list[dict]
    timestamp: str
    warning: Optional[str] = None


class BatchAllocationRequest(BaseModel):
    containers: list[AllocationRequest]
    rtg_position: Optional[list[int]] = None


# ─── RTG ───

class RTGStep(BaseModel):
    action: str
    target: list[int]
    duration_s: int


class RTGMissionResponse(BaseModel):
    mission_id: str
    mission_type: str
    container_id: int
    steps: list[RTGStep]
    total_estimated_time_s: int
    rtg_start_position: Optional[list[int]]
    rtg_end_position: list[int]


# ─── Estado do Pátio ───

class ContainerState(BaseModel):
    container_id: int
    position: list[int]
    weight_class: str
    departure_time: str
    flow_type: str
    is_reefer: bool = False
    imo_class: Optional[str] = None


class YardStateResponse(BaseModel):
    block_name: str
    dimensions: dict
    occupancy_rate: float
    total_containers: int
    containers: list[ContainerState]
    heatmap: list[list[float]]
    reefer_slots: list[list[int]] = []


# ─── Gate-In (3D-compatible) ───

class GateInRequest(BaseModel):
    """Request para o gate-in — entrada de contentor no terminal."""
    container_id: int = Field(..., examples=[1042])
    weight_class: str = Field(..., pattern="^(LIGHT|MEDIUM|HEAVY)$", examples=["HEAVY"])
    weight_kg: int = Field(..., ge=0, le=50000, examples=[28000])
    departure_time: datetime = Field(..., examples=["2026-03-18T14:00:00Z"])
    flow_type: str = Field(..., pattern="^(IMPORT|EXPORT)$", examples=["EXPORT"])
    rtg_position: Optional[list[int]] = Field(None, examples=[[12, 3]])
    block_name: str = Field("A1", examples=["A1"])
    is_reefer: bool = Field(False, examples=[False])
    imo_class: Optional[str] = Field(None, examples=[None])

    model_config = {"json_schema_extra": {"examples": [{"container_id": 1042, "weight_class": "HEAVY", "weight_kg": 28000, "departure_time": "2026-03-18T14:00:00Z", "flow_type": "EXPORT", "rtg_position": [12, 3], "block_name": "A1"}]}}


class Container3D(BaseModel):
    """Representação de um contentor para renderização 3D (React Three Fiber).

    Coordenadas mapeadas para espaço 3D:
      X = bay * SPACING_X   (comprimento do pátio)
      Y = tier * SPACING_Y  (altura — empilhamento)
      Z = row * SPACING_Z   (profundidade)
    """
    id: int
    x: float
    y: float
    z: float
    bay: int
    row: int
    tier: int
    color: str       # hex color baseado no weight_class
    weight_class: str
    weight_kg: int
    flow_type: str
    departure_time: str
    is_reefer: bool = False
    imo_class: Optional[str] = None
    opacity: float = 1.0


class PSOIterationData(BaseModel):
    """Dados de uma iteração PSO para visualização de gráficos."""
    iteration: int
    particles: list[list[float]]
    particles_discrete: list[list[int]]
    particle_scores: list[float]
    g_best_position: list[float]
    g_best_score: float
    inertia: float


class GateInResponse(BaseModel):
    """Resposta do gate-in — compatível com renderer 3D."""
    container_id: int
    assigned_position: list[int]
    cost_score: float
    cost_breakdown: dict
    alternatives: list[dict]
    optimizer_type: str
    computation_ms: int
    warning: Optional[str] = None
    timestamp: str
    container_3d: Container3D
    yard_3d: list[Container3D]
    yard_stats: dict
    pso_history: Optional[list[PSOIterationData]] = None


# ─── Retirada ───

class RetirarRequest(BaseModel):
    """Request para retirar um contentor do pátio."""
    container_id: int = Field(..., examples=[1042])
    block_name: str = Field("A1", examples=["A1"])


class ReshuffleMove(BaseModel):
    """Um movimento de reshuffle necessário para retirar o contentor alvo."""
    container_id: int
    from_position: list[int]
    to_position: list[int]
    cost_score: float


class RetirarResponse(BaseModel):
    """Resposta da retirada — inclui reshuffles necessários."""
    container_id: int
    removed_from: list[int]
    reshuffles: list[ReshuffleMove]
    total_reshuffles: int
    total_time_estimate_s: int
    yard_3d: list[Container3D]
    yard_stats: dict
    timestamp: str
