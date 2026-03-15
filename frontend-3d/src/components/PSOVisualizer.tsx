import { useState, useRef, useEffect, useCallback } from 'react'
import { SkipBack, ChevronLeft, Play, Pause, ChevronRight, SkipForward, X } from 'lucide-react'
import type { PSOIterationData } from '../types/api'

interface Props {
  history: PSOIterationData[]
  yardDimensions: { bays: number; rows: number }
  assignedPosition: [number, number, number]
  onClose: () => void
}

export function PSOVisualizer({ history, yardDimensions, assignedPosition, onClose }: Props) {
  const [currentIter, setCurrentIter] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [tab, setTab] = useState<'scatter' | 'convergence'>('scatter')
  const scatterRef = useRef<HTMLCanvasElement>(null)
  const convRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const iter = history[currentIter]
  const maxIter = history.length - 1

  // Auto-play
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setCurrentIter(prev => {
        if (prev >= maxIter) { setPlaying(false); return maxIter }
        return prev + 1
      })
    }, 120)
    return () => clearInterval(id)
  }, [playing, maxIter])

  // Draw scatter plot (particles in bay/row space)
  const drawScatter = useCallback(() => {
    const canvas = scatterRef.current
    if (!canvas || !iter) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const PAD = 40

    ctx.clearRect(0, 0, W, H)

    // Background
    ctx.fillStyle = '#0d1219'
    ctx.fillRect(0, 0, W, H)

    const plotW = W - PAD * 2
    const plotH = H - PAD * 2

    const toX = (bay: number) => PAD + (bay / Math.max(yardDimensions.bays - 1, 1)) * plotW
    const toY = (row: number) => PAD + (1 - row / Math.max(yardDimensions.rows - 1, 1)) * plotH

    // Grid
    ctx.strokeStyle = '#1c2736'
    ctx.lineWidth = 0.5
    for (let b = 0; b < yardDimensions.bays; b++) {
      const x = toX(b)
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, H - PAD); ctx.stroke()
    }
    for (let r = 0; r < yardDimensions.rows; r++) {
      const y = toY(r)
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
    }

    // Axis labels
    ctx.fillStyle = '#556677'
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'center'
    for (let b = 0; b < yardDimensions.bays; b += 5) {
      ctx.fillText(`B${b}`, toX(b), H - PAD + 14)
    }
    ctx.textAlign = 'right'
    for (let r = 0; r < yardDimensions.rows; r++) {
      ctx.fillText(`R${r}`, PAD - 6, toY(r) + 3)
    }

    // Assigned position (target)
    ctx.fillStyle = 'rgba(74, 158, 127, 0.2)'
    ctx.beginPath()
    ctx.arc(toX(assignedPosition[0]), toY(assignedPosition[1]), 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#4A9E7F'
    ctx.lineWidth = 2
    ctx.stroke()

    // Particles (continuous positions)
    for (let i = 0; i < iter.particles.length; i++) {
      const [bay, row] = iter.particles[i]
      const score = iter.particle_scores[i]
      const maxScore = Math.max(...iter.particle_scores, 1)
      const intensity = 1 - Math.min(score / maxScore, 1)

      // Color: good scores = teal, bad scores = red
      const r_c = Math.round(201 * (1 - intensity) + 123 * intensity)
      const g_c = Math.round(79 * (1 - intensity) + 179 * intensity)
      const b_c = Math.round(79 * (1 - intensity) + 204 * intensity)

      ctx.fillStyle = `rgba(${r_c}, ${g_c}, ${b_c}, 0.85)`
      ctx.beginPath()
      ctx.arc(toX(bay), toY(row), 5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Global best
    const [gbBay, gbRow] = iter.g_best_position
    ctx.strokeStyle = '#E8A838'
    ctx.lineWidth = 2
    ctx.beginPath()
    const gx = toX(gbBay), gy = toY(gbRow)
    ctx.moveTo(gx - 8, gy - 8); ctx.lineTo(gx + 8, gy + 8)
    ctx.moveTo(gx + 8, gy - 8); ctx.lineTo(gx - 8, gy + 8)
    ctx.stroke()

    // Labels
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 11px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`Iteração ${iter.iteration + 1}/${history.length}`, PAD, 16)

    ctx.fillStyle = '#9BA8B4'
    ctx.font = '10px Inter, sans-serif'
    ctx.fillText(`g_best: ${iter.g_best_score.toFixed(2)}  |  w: ${iter.inertia}`, PAD, 30)

    // Legend
    const lx = W - PAD - 100
    ctx.fillStyle = '#E8A838'; ctx.fillText('✕ Global Best', lx, 16)
    ctx.fillStyle = '#4A9E7F'; ctx.fillText('○ Posição Final', lx, 30)
  }, [iter, yardDimensions, assignedPosition, history.length])

  // Draw convergence chart
  const drawConvergence = useCallback(() => {
    const canvas = convRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const PAD = 45

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0d1219'
    ctx.fillRect(0, 0, W, H)

    const plotW = W - PAD * 2
    const plotH = H - PAD * 2

    const scores = history.map(h => h.g_best_score)
    const inertias = history.map(h => h.inertia)
    const maxScore = Math.max(...scores, 0.1)
    const minScore = Math.min(...scores)

    const toX = (i: number) => PAD + (i / Math.max(history.length - 1, 1)) * plotW
    const toYScore = (s: number) => PAD + (1 - (s - minScore) / Math.max(maxScore - minScore, 0.01)) * plotH
    const toYInertia = (w: number) => PAD + (1 - w) * plotH

    // Grid
    ctx.strokeStyle = '#1c2736'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= 5; i++) {
      const y = PAD + (i / 5) * plotH
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
    }

    // Cost line
    ctx.strokeStyle = '#84B8D9'
    ctx.lineWidth = 2
    ctx.beginPath()
    scores.forEach((s, i) => {
      const x = toX(i), y = toYScore(s)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Current iteration marker
    if (currentIter < scores.length) {
      ctx.fillStyle = '#84B8D9'
      ctx.beginPath()
      ctx.arc(toX(currentIter), toYScore(scores[currentIter]), 5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Inertia line
    ctx.strokeStyle = 'rgba(232, 168, 56, 0.6)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    inertias.forEach((w, i) => {
      const x = toX(i), y = toYInertia(w)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.setLineDash([])

    // Axis labels
    ctx.fillStyle = '#556677'
    ctx.font = '10px Inter, sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i <= history.length - 1; i += 5) {
      ctx.fillText(`${i}`, toX(i), H - PAD + 14)
    }
    ctx.fillText('Iteração', W / 2, H - 6)

    ctx.textAlign = 'right'
    ctx.fillText(`${maxScore.toFixed(1)}`, PAD - 4, PAD + 4)
    ctx.fillText(`${minScore.toFixed(1)}`, PAD - 4, H - PAD + 4)

    // Title
    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 11px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('Convergência do Custo Global', PAD, 16)

    // Legend
    const lx = W - PAD - 140
    ctx.fillStyle = '#84B8D9'; ctx.fillText('— Custo g_best', lx, 16)
    ctx.fillStyle = '#E8A838'; ctx.fillText('-- Inércia (w)', lx, 30)

    // Final value
    ctx.fillStyle = '#4A9E7F'
    ctx.font = 'bold 12px Inter, sans-serif'
    ctx.fillText(`Final: ${scores[scores.length - 1].toFixed(4)}`, PAD, 30)
  }, [history, currentIter])

  useEffect(() => {
    if (tab === 'scatter') drawScatter()
    else drawConvergence()
  }, [tab, drawScatter, drawConvergence])

  return (
    <div className="pso-viz-overlay">
      <div className="pso-viz-panel">
        <div className="pso-viz-header">
          <h3>PSO Visualizer</h3>
          <div className="pso-viz-tabs">
            <button className={`pso-tab ${tab === 'scatter' ? 'active' : ''}`} onClick={() => setTab('scatter')}>
              Partículas
            </button>
            <button className={`pso-tab ${tab === 'convergence' ? 'active' : ''}`} onClick={() => setTab('convergence')}>
              Convergência
            </button>
          </div>
          <button className="pso-close" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
        </div>

        <div className="pso-viz-canvas-wrap">
          {tab === 'scatter' && (
            <canvas ref={scatterRef} width={580} height={340} className="pso-canvas" />
          )}
          {tab === 'convergence' && (
            <canvas ref={convRef} width={580} height={340} className="pso-canvas" />
          )}
        </div>

        {tab === 'scatter' && (
          <div className="pso-viz-controls">
            <button className="pso-ctrl-btn" onClick={() => { setCurrentIter(0); setPlaying(false) }}><SkipBack size={14} strokeWidth={1.5} /></button>
            <button className="pso-ctrl-btn" onClick={() => setCurrentIter(i => Math.max(0, i - 1))}><ChevronLeft size={14} strokeWidth={1.5} /></button>
            <button className="pso-ctrl-btn play" onClick={() => setPlaying(!playing)}>
              {playing ? <Pause size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />}
            </button>
            <button className="pso-ctrl-btn" onClick={() => setCurrentIter(i => Math.min(maxIter, i + 1))}><ChevronRight size={14} strokeWidth={1.5} /></button>
            <button className="pso-ctrl-btn" onClick={() => { setCurrentIter(maxIter); setPlaying(false) }}><SkipForward size={14} strokeWidth={1.5} /></button>
            <input
              type="range"
              min={0}
              max={maxIter}
              value={currentIter}
              onChange={e => { setCurrentIter(+e.target.value); setPlaying(false) }}
              className="pso-slider"
            />
            <span className="pso-iter-label">{currentIter + 1}/{history.length}</span>
          </div>
        )}

        {/* Stats row */}
        <div className="pso-viz-stats">
          <div className="pso-stat-item">
            <span className="pso-stat-label">Partículas</span>
            <span className="pso-stat-value">{history[0]?.particles.length}</span>
          </div>
          <div className="pso-stat-item">
            <span className="pso-stat-label">Iterações</span>
            <span className="pso-stat-value">{history.length}</span>
          </div>
          <div className="pso-stat-item">
            <span className="pso-stat-label">Custo Inicial</span>
            <span className="pso-stat-value">{history[0]?.g_best_score.toFixed(2)}</span>
          </div>
          <div className="pso-stat-item">
            <span className="pso-stat-label">Custo Final</span>
            <span className="pso-stat-value highlight">{history[history.length - 1]?.g_best_score.toFixed(2)}</span>
          </div>
          <div className="pso-stat-item">
            <span className="pso-stat-label">Posição Final</span>
            <span className="pso-stat-value highlight">B{assignedPosition[0]} R{assignedPosition[1]} T{assignedPosition[2]}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
