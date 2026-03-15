import { useState } from 'react'
import { YardScene } from './components/YardScene'
import { ControlPanel } from './components/ControlPanel'
import { useYard } from './hooks/useYard'
import type { Container3D } from './types/api'
import dokaWordmark from './assets/Wordmark White With Blue.svg'
import './App.css'

function App() {
  const yard = useYard()
  const [selectedContainer, setSelectedContainer] = useState<Container3D | null>(null)

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-left">
          <img src={dokaWordmark} alt="Doka" className="logo-wordmark" />
          <div className={`status-pill ${yard.connected ? 'live' : ''}`}>
            <div className="status-dot-mini" />
            {yard.connected ? 'Online' : 'Offline'}
          </div>
        </div>
        <div className="topbar-stats">
          <div className="stat-chip">
            <span className="stat-chip-value">{yard.stats.total}</span>
            <span className="stat-chip-label">containers</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-value">{(yard.stats.rate * 100).toFixed(0)}%</span>
            <span className="stat-chip-label">ocupação</span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip-value">{yard.stats.capacity}</span>
            <span className="stat-chip-label">capacidade</span>
          </div>
        </div>
      </header>

      {/* Full-screen canvas */}
      <div className="canvas-wrapper">
        <YardScene
          containers={yard.containers}
          dimensions={yard.dimensions}
          highlightId={yard.highlightId}
          removingId={yard.removingId}
          onContainerClick={setSelectedContainer}
        />

        {/* Floating controls */}
        <ControlPanel
          onInitialize={yard.initialize}
          onGateIn={yard.gateIn}
          onRemove={yard.removeContainer}
          onBulkLoadCsv={yard.bulkLoadCsv}
          stats={yard.stats}
          lastResult={yard.lastResult}
          lastRemoval={yard.lastRemoval}
          selectedContainer={selectedContainer}
          loading={yard.loading}
          error={yard.error}
          connected={yard.connected}
          containers={yard.containers}
          removingId={yard.removingId}
        />

        {/* Animation label */}
        {yard.animatingLabel && (
          <div className="animation-label">
            {yard.animatingLabel}
          </div>
        )}

        {/* Legend */}
        <div className="legend">
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: 'var(--error)' }} />
            <span>Heavy</span>
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: 'var(--warning)' }} />
            <span>Medium</span>
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: 'var(--brand-primary)' }} />
            <span>Light</span>
          </div>
        </div>

        {/* Empty state */}
        {yard.containers.length === 0 && yard.connected && (
          <div className="empty-overlay">
            <div className="empty-icon">⚓</div>
            <p>Pátio vazio — use os controles abaixo para alocar contentores</p>
          </div>
        )}
        {!yard.connected && (
          <div className="empty-overlay">
            <div className="empty-icon">⚡</div>
            <p>A conectar ao backend...<br />Certifique-se que o servidor está a correr na porta 8000</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
