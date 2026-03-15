import { useState } from 'react'
import { YardScene } from './components/YardScene'
import { ControlPanel } from './components/ControlPanel'
import { PSOVisualizer } from './components/PSOVisualizer'
import { TimelineSlider } from './components/TimelineSlider'
import { MiniMap } from './components/MiniMap'
import { AnalyticsSidebar } from './components/AnalyticsSidebar'
import { useYard } from './hooks/useYard'
import type { Container3D, PSOIterationData } from './types/api'
import dokaWordmark from './assets/Wordmark White With Blue.svg'
import './App.css'

function App() {
  const yard = useYard()
  const [selectedContainer, setSelectedContainer] = useState<Container3D | null>(null)
  const [psoView, setPsoView] = useState<{
    history: PSOIterationData[]
    position: [number, number, number]
  } | null>(null)
  const [searchInput, setSearchInput] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const id = parseInt(searchInput)
    if (!isNaN(id)) {
      yard.searchContainer(id)
      setSearchInput('')
    }
  }

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

        {/* Toolbar: search + toggles */}
        <div className="topbar-tools">
          <form className="search-form" onSubmit={handleSearch}>
            <input
              type="text"
              className="search-input"
              placeholder="Buscar container #ID"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </form>
          <button
            className={`tool-btn ${yard.xrayMode ? 'active' : ''}`}
            onClick={() => yard.setXrayMode(!yard.xrayMode)}
            title="Modo Raio-X"
          >
            Raio-X
          </button>
          <button
            className={`tool-btn ${yard.viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => yard.setViewMode(yard.viewMode === 'heatmap' ? 'normal' : 'heatmap')}
            title="Heatmap de Ocupação"
          >
            Heatmap
          </button>
          <AnalyticsSidebar block={yard.activeBlock} connected={yard.connected} />
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
          {yard.activeBlock && (
            <div className="stat-chip">
              <span className="stat-chip-value">{yard.activeBlock}</span>
              <span className="stat-chip-label">bloco</span>
            </div>
          )}
        </div>
      </header>

      {/* Full-screen canvas */}
      <div className="canvas-wrapper">
        <YardScene
          containers={yard.containers}
          dimensions={yard.dimensions}
          highlightId={yard.highlightId}
          removingId={yard.removingId}
          xrayMode={yard.xrayMode}
          simulatedHours={yard.simulatedHours}
          cameraTarget={yard.cameraTarget}
          heatmap={yard.heatmap}
          viewMode={yard.viewMode}
          reeferSlots={yard.reeferSlots}
          rtgTarget={yard.rtgTarget}
          rtgCarriedId={yard.rtgCarriedId}
          searchId={yard.searchId}
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
          prefillRemoveId={yard.searchId}
          activeBlock={yard.activeBlock}
          onShowPSO={(history: PSOIterationData[], position: [number, number, number]) => setPsoView({ history, position })}
        />

        {/* PSO Visualizer */}
        {psoView && yard.dimensions && (
          <PSOVisualizer
            history={psoView.history}
            yardDimensions={{ bays: yard.dimensions.bays, rows: yard.dimensions.rows }}
            assignedPosition={psoView.position}
            onClose={() => setPsoView(null)}
          />
        )}

        {/* Timeline slider for time travel */}
        <TimelineSlider
          value={yard.simulatedHours}
          onChange={yard.setSimulatedHours}
        />

        {/* Mini-map for multi-block */}
        <MiniMap
          activeBlock={yard.activeBlock}
          onSwitch={yard.switchBlock}
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
