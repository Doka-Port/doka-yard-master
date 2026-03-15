import { useState, useCallback, useRef, useEffect } from 'react'
import type { Container3D, GateInRequest, GateInResponse, YardStateResponse, RetirarResponse, CsvContainer } from '../types/api'

const API = '/api/v1'

// 3D spacing (must match backend gate.py)
const SX = 6.5
const SY = 2.9
const SZ = 2.8

function posTo3D(bay: number, row: number, tier: number) {
  return { x: bay * SX, y: tier * SY, z: row * SZ }
}

function stateToContainers3D(state: YardStateResponse): Container3D[] {
  const COLORS: Record<string, string> = {
    HEAVY: '#C94F4F', // Doka Error Red
    MEDIUM: '#E8A838', // Doka Warning Gold
    LIGHT: '#84B8D9', // Doka Brand Blue
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
    is_reefer: c.is_reefer,
    imo_class: c.imo_class,
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
  const [xrayMode, setXrayMode] = useState(false)
  const [searchId, setSearchId] = useState<number | null>(null)
  const [cameraTarget, setCameraTarget] = useState<{ x: number; y: number; z: number } | null>(null)
  const [viewMode, setViewMode] = useState<'normal' | 'heatmap'>('normal')
  const [heatmap, setHeatmap] = useState<number[][] | null>(null)
  const [simulatedHours, setSimulatedHours] = useState<number>(0)
  const [activeBlock, setActiveBlock] = useState('A1')
  const [rtgTarget, setRtgTarget] = useState<{ bay: number; row: number; tier: number; phase: 'idle' | 'moving' | 'lowering' | 'lifting' | 'locked' }>({ bay: 0, row: 0, tier: 0, phase: 'idle' })
  const [reeferSlots, setReeferSlots] = useState<number[][] | null>(null)
  const [rtgCarriedId, setRtgCarriedId] = useState<number | null>(null)

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
      let r = await fetch(`${API}/patio/estado?block_name=${block}`)
      if (r.status === 409) {
        // Block not initialized yet — auto-initialize it
        const init = await fetch(`${API}/patio/inicializar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ num_bays: 30, num_rows: 6, max_tiers: 5, block_name: block }),
        })
        if (!init.ok) { setConnected(false); return }
        r = await fetch(`${API}/patio/estado?block_name=${block}`)
      }
      if (!r.ok) {
        setConnected(false)
        return
      }
      const data: YardStateResponse = await r.json()
      setContainers(stateToContainers3D(data))
      setDimensions(data.dimensions)
      if (data.heatmap) setHeatmap(data.heatmap)
      if (data.reefer_slots) setReeferSlots(data.reefer_slots)
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
      const [bay, row, tier] = data.assigned_position

      // Dynamic timing based on distance
      const dxBays = Math.abs(bay - rtgTarget.bay) * SX
      const dzRows = Math.abs(row - rtgTarget.row) * SZ
      const moveTime = Math.max(dxBays / 25, dzRows / 15) * 1000 + 100
      const REST_Y = 28 - 1.5 - 1.0 - 1
      const lowerTime = (Math.abs(REST_Y - (tier * SY + SY / 2)) / 12) * 1000 + 100
      const liftTime = lowerTime

      // RTG crane animation sequence with dynamic timing
      let t = 0
      setRtgTarget({ bay, row, tier, phase: 'moving' })
      t += moveTime
      setTimeout(() => setRtgTarget({ bay, row, tier, phase: 'lowering' }), t)
      t += lowerTime
      setTimeout(() => setRtgTarget({ bay, row, tier, phase: 'locked' }), t)
      t += 400

      // Place the container with drop animation
      const newContainer = data.yard_3d.find(c => c.id === data.container_id)
      const dropTime = t
      setTimeout(() => {
        if (newContainer) {
          const yardWithDrop = data.yard_3d.map(c =>
            c.id === data.container_id ? { ...c, y: c.y + 25 } : c
          )
          setContainers(yardWithDrop)
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
        setTimeout(() => {
          setHighlightId(null)
          setRtgTarget({ bay, row, tier, phase: 'lifting' })
          setTimeout(() => setRtgTarget(prev => ({ ...prev, phase: 'idle' })), liftTime)
        }, 3000)
      }, dropTime)

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

      // RTG physical speeds (units/sec) — must match RTGCrane.tsx useFrame speeds
      const GANTRY_SPEED = 25   // X axis
      const TROLLEY_SPEED = 15  // Z axis
      const SPREADER_SPEED = 12 // Y axis
      const REST_Y = 28 - 1.5 - 1.0 - 1  // LEG_HEIGHT - BEAM_HEIGHT - TROLLEY_H - 1
      const LOCK_TIME = 400     // ms for lock/unlock
      const PAUSE = 200         // ms between steps

      // Calculate time (ms) for RTG to travel between two positions
      function travelTime(fromBay: number, fromRow: number, toBay: number, toRow: number): number {
        const dx = Math.abs(toBay - fromBay) * SX
        const dz = Math.abs(toRow - fromRow) * SZ
        // Gantry and trolley move simultaneously, take the slower one
        const tX = dx / GANTRY_SPEED
        const tZ = dz / TROLLEY_SPEED
        return Math.max(tX, tZ) * 1000 + 100 // +100ms margin
      }

      // Calculate time for spreader to travel vertically
      function spreaderTime(fromY: number, toY: number): number {
        return (Math.abs(toY - fromY) / SPREADER_SPEED) * 1000 + 100
      }

      const currentSnapshot = [...containersRef.current]
      let stepContainers = currentSnapshot
      let delay = 0
      // Track RTG's current logical position for distance calculation
      let rtgBay = rtgTarget.bay
      let rtgRow = rtgTarget.row

      // Animate each reshuffle with RTG
      for (let i = 0; i < data.reshuffles.length; i++) {
        const reshuffle = data.reshuffles[i]
        const [fromBay, fromRow, fromTier] = reshuffle.from_position
        const [toBay, toRow, toTier] = reshuffle.to_position
        const toPos = posTo3D(toBay, toRow, toTier)
        const cid = reshuffle.container_id

        // 1. RTG moves to pickup position
        const moveToPickup = travelTime(rtgBay, rtgRow, fromBay, fromRow)
        const d1 = delay
        setTimeout(() => {
          setAnimatingLabel(`Reshuffle #${cid}`)
          setRtgTarget({ bay: fromBay, row: fromRow, tier: fromTier, phase: 'moving' })
        }, d1)
        delay += moveToPickup

        // 2. Lower spreader to container
        const lowerToContainer = spreaderTime(REST_Y, fromTier * SY + SY / 2)
        const d2 = delay
        setTimeout(() => {
          setRtgTarget({ bay: fromBay, row: fromRow, tier: fromTier, phase: 'lowering' })
        }, d2)
        delay += lowerToContainer

        // 3. Lock — RTG grabs container
        const d3 = delay
        setTimeout(() => {
          setRtgTarget({ bay: fromBay, row: fromRow, tier: fromTier, phase: 'locked' })
          setRtgCarriedId(cid)
        }, d3)
        delay += LOCK_TIME

        // 4. Lift (container follows spreader up)
        const liftUp = spreaderTime(fromTier * SY + SY / 2, REST_Y)
        const d4 = delay
        setTimeout(() => {
          setRtgTarget({ bay: fromBay, row: fromRow, tier: fromTier, phase: 'lifting' })
        }, d4)
        delay += liftUp

        // 5. RTG moves to drop position (container follows automatically)
        const moveToDrop = travelTime(fromBay, fromRow, toBay, toRow)
        const prevContainers = [...stepContainers]
        stepContainers = prevContainers.map(c => {
          if (c.id === cid) {
            return { ...c, x: toPos.x, y: toPos.y, z: toPos.z, bay: toBay, row: toRow, tier: toTier }
          }
          return c
        })
        const d5 = delay
        setTimeout(() => {
          setRtgTarget({ bay: toBay, row: toRow, tier: toTier, phase: 'moving' })
        }, d5)
        delay += moveToDrop

        // 6. Lower to place
        const lowerToPlace = spreaderTime(REST_Y, toTier * SY + SY / 2)
        const d6 = delay
        setTimeout(() => {
          setRtgTarget({ bay: toBay, row: toRow, tier: toTier, phase: 'lowering' })
        }, d6)
        delay += lowerToPlace

        // 7. Release — detach container, update position
        const snapshot = [...stepContainers]
        const d7 = delay
        setTimeout(() => {
          setRtgCarriedId(null)
          setContainers(snapshot)
          setRtgTarget({ bay: toBay, row: toRow, tier: toTier, phase: 'lifting' })
        }, d7)
        const liftAfterRelease = spreaderTime(toTier * SY + SY / 2, REST_Y)
        delay += liftAfterRelease + PAUSE

        rtgBay = toBay
        rtgRow = toRow
      }

      // Now retrieve the target container
      const targetC = stepContainers.find(c => c.id === containerId)
      const tBay = targetC?.bay ?? 0
      const tRow = targetC?.row ?? 0
      const tTier = targetC?.tier ?? 0

      // RTG moves to target container
      const moveToTarget = travelTime(rtgBay, rtgRow, tBay, tRow)
      const dr1 = delay
      setTimeout(() => {
        setAnimatingLabel(`Retirando #${containerId}`)
        setRtgTarget({ bay: tBay, row: tRow, tier: tTier, phase: 'moving' })
      }, dr1)
      delay += moveToTarget

      // Lower spreader
      const lowerToTarget = spreaderTime(REST_Y, tTier * SY + SY / 2)
      const dr2 = delay
      setTimeout(() => {
        setRtgTarget({ bay: tBay, row: tRow, tier: tTier, phase: 'lowering' })
      }, dr2)
      delay += lowerToTarget

      // Lock — RTG grabs target container
      const dr3 = delay
      setTimeout(() => {
        setRtgTarget({ bay: tBay, row: tRow, tier: tTier, phase: 'locked' })
        setRtgCarriedId(containerId)
      }, dr3)
      delay += LOCK_TIME

      // Lift container out (container follows spreader up)
      const liftOut = spreaderTime(tTier * SY + SY / 2, REST_Y)
      const dr4 = delay
      setTimeout(() => {
        setRtgTarget({ bay: tBay, row: tRow, tier: tTier, phase: 'lifting' })
      }, dr4)
      delay += liftOut + 500

      // Final: set server state, reset RTG
      const dFinal = delay
      setTimeout(() => {
        setRtgCarriedId(null)
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
        setRtgTarget(prev => ({ ...prev, phase: 'idle' }))
      }, dFinal)

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
          setLastResult(data)
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

  const searchContainer = useCallback((id: number) => {
    const c = containersRef.current.find(c => c.id === id)
    if (c) {
      setSearchId(id)
      setHighlightId(id)
      setCameraTarget({ x: c.x, y: c.y + 5, z: c.z })
      setTimeout(() => { setHighlightId(null); setSearchId(null) }, 4000)
    }
  }, [])

  const switchBlock = useCallback(async (block: string) => {
    setActiveBlock(block)
    await fetchState(block)
  }, [fetchState])

  // Auto-refresh every 5s
  useEffect(() => {
    fetchState(activeBlock)
    intervalRef.current = setInterval(() => fetchState(activeBlock), 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchState, activeBlock])

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
    xrayMode,
    setXrayMode,
    searchId,
    searchContainer,
    cameraTarget,
    viewMode,
    setViewMode,
    heatmap,
    simulatedHours,
    setSimulatedHours,
    activeBlock,
    switchBlock,
    rtgTarget,
    rtgCarriedId,
    reeferSlots,
    initialize,
    gateIn,
    removeContainer,
    bulkLoadCsv,
    fetchState,
  }
}
