import { useState, useCallback, useRef, useEffect } from 'react'
import type { Container3D, GateInRequest, GateInResponse, YardStateResponse, RetirarResponse, CsvContainer } from '../types/api'

const API = '/api/v1'

// 3D spacing (must match backend gate.py)
const SX = 6.5
const SY = 2.9
const SZ = 2.8

const ANIMATION_STEP_DELAY = 1200 // ms between reshuffle animation steps

function posTo3D(bay: number, row: number, tier: number) {
  return { x: bay * SX, y: tier * SY, z: row * SZ }
}

function stateToContainers3D(state: YardStateResponse): Container3D[] {
  const COLORS: Record<string, string> = {
    HEAVY: '#C94F4F', // Doka Error Red
    MEDIUM: '#E8A838', // Doka Warning Gold
    LIGHT: '#7BB3CC', // Doka Brand Blue
  }
  return state.containers.map((c) => ({
    id: c.container_id,
    x: c.position[0] * SX,
    y: c.position[2] * SY,
    z: c.position[1] * SZ,
    bay: c.position[0],
    row: c.position[1],
    tier: c.position[2],
    color: COLORS[c.weight_class] || '#8899aa',
    weight_class: c.weight_class as Container3D['weight_class'],
    weight_kg: 0,
    flow_type: c.flow_type as Container3D['flow_type'],
    departure_time: c.departure_time,
    opacity: 1,
  }))
}

export function useYard() {
  const [containers, setContainers] = useState<Container3D[]>([])
  const [dimensions, setDimensions] = useState<{ bays: number; rows: number; tiers: number } | null>(null)
  const [stats, setStats] = useState<{
    total: number
    capacity: number
    rate: number
  }>({ total: 0, capacity: 0, rate: 0 })
  const [lastResult, setLastResult] = useState<GateInResponse | null>(null)
  const [lastRemoval, setLastRemoval] = useState<RetirarResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [animatingLabel, setAnimatingLabel] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containersRef = useRef<Container3D[]>([])
  const animatingRef = useRef(false)

  // Keep ref in sync
  useEffect(() => {
    containersRef.current = containers
  }, [containers])

  const fetchState = useCallback(async (block = 'A1') => {
    if (animatingRef.current) return // skip refresh during animations
    try {
      const r = await fetch(`${API}/patio/estado?block_name=${block}`)
      if (!r.ok) {
        setConnected(false)
        return
      }
      const data: YardStateResponse = await r.json()
      setContainers(stateToContainers3D(data))
      setDimensions(data.dimensions)
      setStats({
        total: data.total_containers,
        capacity: data.dimensions.bays * data.dimensions.rows * data.dimensions.tiers,
        rate: data.occupancy_rate,
      })
      setConnected(true)
    } catch {
      setConnected(false)
    }
  }, [])

  const initialize = useCallback(async (bays = 30, rows = 6, tiers = 5, block = 'A1') => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API}/patio/inicializar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num_bays: bays, num_rows: rows, max_tiers: tiers, block_name: block }),
      })
      if (!r.ok) throw new Error((await r.json()).detail)
      const data = await r.json()
      setDimensions(data.dimensions)
      setContainers([])
      setStats({ total: 0, capacity: data.total_capacity, rate: 0 })
      setConnected(true)
      return data
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const gateIn = useCallback(async (req: GateInRequest): Promise<GateInResponse | null> => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API}/gate-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!r.ok) throw new Error((await r.json()).detail)
      const data: GateInResponse = await r.json()

      // For placement animation: insert the new container with a high Y offset
      // ContainerBox will lerp it down to the real position
      const newContainer = data.yard_3d.find(c => c.id === data.container_id)
      if (newContainer) {
        // First render: new container starts 25 units above its real Y
        const yardWithDrop = data.yard_3d.map(c =>
          c.id === data.container_id ? { ...c, y: c.y + 25 } : c
        )
        setContainers(yardWithDrop)
        // After a tick, set real positions — ContainerBox lerps to target
        requestAnimationFrame(() => {
          setContainers(data.yard_3d)
        })
      } else {
        setContainers(data.yard_3d)
      }

      setStats({
        total: data.yard_stats.total_containers,
        capacity: data.yard_stats.total_capacity,
        rate: data.yard_stats.occupancy_rate,
      })
      setDimensions(data.yard_stats.dimensions)
      setLastResult(data)
      setHighlightId(data.container_id)
      setTimeout(() => setHighlightId(null), 3000)
      return data
    } catch (e: any) {
      setError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const removeContainer = useCallback(async (containerId: number, block = 'A1'): Promise<RetirarResponse | null> => {
    setLoading(true)
    setError(null)
    setRemovingId(containerId)
    animatingRef.current = true
    try {
      const r = await fetch(`${API}/retirar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container_id: containerId, block_name: block }),
      })
      if (!r.ok) throw new Error((await r.json()).detail)
      const data: RetirarResponse = await r.json()

      // Build animation sequence using timeouts (no await sleep)
      const currentSnapshot = [...containersRef.current]
      let stepContainers = currentSnapshot

      const totalSteps = data.reshuffles.length
      let delay = 0

      // Schedule each reshuffle as a timed step
      for (let i = 0; i < totalSteps; i++) {
        const reshuffle = data.reshuffles[i]
        const toPos = posTo3D(reshuffle.to_position[0], reshuffle.to_position[1], reshuffle.to_position[2])

        // Capture current state for closure
        const prevContainers = [...stepContainers]
        stepContainers = prevContainers.map(c => {
          if (c.id === reshuffle.container_id) {
            return {
              ...c,
              x: toPos.x,
              y: toPos.y,
              z: toPos.z,
              bay: reshuffle.to_position[0],
              row: reshuffle.to_position[1],
              tier: reshuffle.to_position[2],
            }
          }
          return c
        })
        const snapshot = [...stepContainers]

        setTimeout(() => {
          setAnimatingLabel(`Reshuffle #${reshuffle.container_id}`)
          setContainers(snapshot)
        }, delay)
        delay += ANIMATION_STEP_DELAY
      }

      // After all reshuffles: lift the target container up
      const afterReshuffles = [...stepContainers]
      setTimeout(() => {
        setAnimatingLabel(`Retirando #${containerId}`)
        const lifted = afterReshuffles.map(c =>
          c.id === containerId ? { ...c, y: c.y + 30 } : c
        )
        setContainers(lifted)
      }, delay)
      delay += 800

      // Final: set server state
      setTimeout(() => {
        setContainers(data.yard_3d)
        setStats({
          total: data.yard_stats.total_containers,
          capacity: data.yard_stats.total_capacity,
          rate: data.yard_stats.occupancy_rate,
        })
        setDimensions(data.yard_stats.dimensions)
        setLastRemoval(data)
        setAnimatingLabel(null)
        setLoading(false)
        setRemovingId(null)
        animatingRef.current = false
      }, delay)

      return data
    } catch (e: any) {
      setError(e.message)
      setAnimatingLabel(null)
      setLoading(false)
      setRemovingId(null)
      animatingRef.current = false
      return null
    }
  }, [])

  const bulkLoadCsv = useCallback(async (csvContainers: CsvContainer[], block = 'A1'): Promise<{ success: number; errors: string[] }> => {
    setLoading(true)
    setError(null)
    let successCount = 0
    const errors: string[] = []
    try {
      for (const c of csvContainers) {
        const r = await fetch(`${API}/gate-in`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            container_id: c.container_id,
            weight_class: c.weight_class,
            weight_kg: c.weight_kg,
            departure_time: c.departure_time,
            flow_type: c.flow_type,
            rtg_position: [0, 0],
            block_name: block,
          }),
        })
        if (r.ok) {
          const data: GateInResponse = await r.json()
          setContainers(data.yard_3d)
          setStats({
            total: data.yard_stats.total_containers,
            capacity: data.yard_stats.total_capacity,
            rate: data.yard_stats.occupancy_rate,
          })
          setDimensions(data.yard_stats.dimensions)
          successCount++
        } else {
          const detail = await r.json().catch(() => ({ detail: r.statusText }))
          errors.push(`#${c.container_id}: ${detail.detail || r.statusText}`)
        }
      }
      if (errors.length > 0) {
        setError(`Falhas: ${errors.join('; ')}`)
      }
      return { success: successCount, errors }
    } catch (e: any) {
      setError(e.message)
      return { success: successCount, errors }
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-refresh every 5s
  useEffect(() => {
    fetchState()
    intervalRef.current = setInterval(() => fetchState(), 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchState])

  return {
    containers,
    dimensions,
    stats,
    lastResult,
    lastRemoval,
    loading,
    error,
    connected,
    highlightId,
    removingId,
    animatingLabel,
    initialize,
    gateIn,
    removeContainer,
    bulkLoadCsv,
    fetchState,
  }
}
