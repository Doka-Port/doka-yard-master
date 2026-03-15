export interface Container3D {
  id: number
  x: number
  y: number
  z: number
  bay: number
  row: number
  tier: number
  color: string
  weight_class: 'LIGHT' | 'MEDIUM' | 'HEAVY'
  weight_kg: number
  flow_type: 'IMPORT' | 'EXPORT'
  departure_time: string
  opacity: number
}

export interface GateInRequest {
  container_id: number
  weight_class: 'LIGHT' | 'MEDIUM' | 'HEAVY'
  weight_kg: number
  departure_time: string
  flow_type: 'IMPORT' | 'EXPORT'
  rtg_position: [number, number] | null
  block_name: string
}

export interface PSOIterationData {
  iteration: number
  particles: [number, number][]
  particles_discrete: [number, number, number][]
  particle_scores: number[]
  g_best_position: [number, number]
  g_best_score: number
  inertia: number
}

export interface GateInResponse {
  container_id: number
  assigned_position: [number, number, number]
  cost_score: number
  cost_breakdown: Record<string, number>
  alternatives: { position: number[]; score: number }[]
  optimizer_type: string
  computation_ms: number
  warning: string | null
  timestamp: string
  container_3d: Container3D
  yard_3d: Container3D[]
  yard_stats: {
    total_containers: number
    total_capacity: number
    occupancy_rate: number
    dimensions: { bays: number; rows: number; tiers: number }
  }
  pso_history: PSOIterationData[] | null
}

export interface YardStateResponse {
  block_name: string
  dimensions: { bays: number; rows: number; tiers: number }
  occupancy_rate: number
  total_containers: number
  containers: {
    container_id: number
    position: [number, number, number]
    weight_class: string
    departure_time: string
    flow_type: string
  }[]
  heatmap: number[][]
}

export interface InitResponse {
  status: string
  block_name: string
  dimensions: { bays: number; rows: number; tiers: number }
  total_capacity: number
  current_occupancy: number
}

export interface ReshuffleMove {
  container_id: number
  from_position: [number, number, number]
  to_position: [number, number, number]
  cost_score: number
}

export interface RetirarResponse {
  container_id: number
  removed_from: [number, number, number]
  reshuffles: ReshuffleMove[]
  total_reshuffles: number
  total_time_estimate_s: number
  yard_3d: Container3D[]
  yard_stats: {
    total_containers: number
    total_capacity: number
    occupancy_rate: number
    dimensions: { bays: number; rows: number; tiers: number }
  }
  timestamp: string
}

export interface CsvContainer {
  container_id: number
  weight_class: 'LIGHT' | 'MEDIUM' | 'HEAVY'
  weight_kg: number
  departure_time: string
  flow_type: 'IMPORT' | 'EXPORT'
}

// ─── Animation ───

export interface AnimatingContainer {
  id: number
  fromX: number; fromY: number; fromZ: number
  toX: number; toY: number; toZ: number
  color: string
  weight_class: string
  type: 'place' | 'reshuffle' | 'remove'
  progress: number // 0..1
}
