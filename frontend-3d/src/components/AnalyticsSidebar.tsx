import { useState, useEffect, useCallback } from 'react'

const API = '/api/v1'

interface Analytics {
  total_allocations: number
  avg_cost: number
  total_computation_ms: number
  total_removals: number
  current_occupancy: number
  total_capacity: number
  occupancy_rate: number
}

interface Props {
  block: string
  connected: boolean
}

export function AnalyticsSidebar({ block, connected }: Props) {
  const [data, setData] = useState<Analytics | null>(null)
  const [open, setOpen] = useState(false)

  const fetchAnalytics = useCallback(async () => {
    if (!connected) return
    try {
      const r = await fetch(`${API}/patio/analytics?block_name=${block}`)
      if (r.ok) setData(await r.json())
    } catch { /* ignore */ }
  }, [block, connected])

  useEffect(() => {
    if (open) {
      fetchAnalytics()
      const interval = setInterval(fetchAnalytics, 10000)
      return () => clearInterval(interval)
    }
  }, [open, fetchAnalytics])

  return (
    <>
      <button
        className={`analytics-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Analytics"
      >
        Analytics
      </button>
      {open && data && (
        <div className="analytics-panel">
          <div className="analytics-title">Eficiência do Pátio</div>
          <div className="analytics-grid">
            <div className="analytics-item">
              <span className="analytics-value">{data.total_allocations}</span>
              <span className="analytics-label">Alocações</span>
            </div>
            <div className="analytics-item">
              <span className="analytics-value">{data.total_removals}</span>
              <span className="analytics-label">Remoções</span>
            </div>
            <div className="analytics-item">
              <span className="analytics-value">{data.avg_cost.toFixed(2)}</span>
              <span className="analytics-label">Custo Médio</span>
            </div>
            <div className="analytics-item">
              <span className="analytics-value">{data.total_computation_ms}ms</span>
              <span className="analytics-label">Tempo Total PSO</span>
            </div>
          </div>
          {/* Occupancy bar */}
          <div className="analytics-bar-section">
            <div className="analytics-bar-header">
              <span>Ocupação</span>
              <span>{(data.occupancy_rate * 100).toFixed(1)}%</span>
            </div>
            <div className="analytics-bar-bg">
              <div
                className="analytics-bar-fill"
                style={{
                  width: `${data.occupancy_rate * 100}%`,
                  background: data.occupancy_rate > 0.8 ? 'var(--error)' : data.occupancy_rate > 0.6 ? 'var(--warning)' : 'var(--brand-primary)',
                }}
              />
            </div>
            <div className="analytics-bar-footer">
              {data.current_occupancy} / {data.total_capacity} slots
            </div>
          </div>
        </div>
      )}
    </>
  )
}
