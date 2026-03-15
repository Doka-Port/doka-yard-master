import { useState, useRef } from 'react'
import type { GateInRequest, GateInResponse, Container3D, RetirarResponse, CsvContainer, PSOIterationData } from '../types/api'

type Mode = 'preenchimento' | 'retirada'

interface Props {
  onInitialize: (bays: number, rows: number, tiers: number, block: string) => Promise<any>
  onGateIn: (req: GateInRequest) => Promise<GateInResponse | null>
  onRemove: (containerId: number) => Promise<RetirarResponse | null>
  onBulkLoadCsv: (containers: CsvContainer[]) => Promise<{ success: number; errors: string[] }>
  stats: { total: number; capacity: number; rate: number }
  lastResult: GateInResponse | null
  lastRemoval: RetirarResponse | null
  selectedContainer: Container3D | null
  loading: boolean
  error: string | null
  connected: boolean
  containers: Container3D[]
  removingId: number | null
  onShowPSO: (history: PSOIterationData[], position: [number, number, number]) => void
}

function parseCsv(text: string): CsvContainer[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const header = lines[0].toLowerCase().replace(/\s/g, '')
  const cols = header.split(/[,;|\t]/)

  const idIdx = cols.findIndex(c => c.includes('container_id') || c.includes('id'))
  const wcIdx = cols.findIndex(c => c.includes('weight_class') || c.includes('peso') || c.includes('class'))
  const wkgIdx = cols.findIndex(c => c.includes('weight_kg') || c.includes('kg') || c.includes('peso_kg'))
  const depIdx = cols.findIndex(c => c.includes('departure') || c.includes('saida') || c.includes('saída'))
  const flowIdx = cols.findIndex(c => c.includes('flow') || c.includes('fluxo') || c.includes('tipo'))

  const result: CsvContainer[] = []
  const sep = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ','

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts = line.split(sep)

    const containerId = idIdx >= 0 ? parseInt(parts[idIdx]) : i
    const weightClass = wcIdx >= 0 ? parts[wcIdx].trim().toUpperCase() as CsvContainer['weight_class'] : 'MEDIUM'
    const weightKg = wkgIdx >= 0 ? parseInt(parts[wkgIdx]) : 18000
    const departureTime = depIdx >= 0 ? parts[depIdx].trim() : new Date(Date.now() + 5 * 86400000).toISOString()
    const flowType = flowIdx >= 0 ? parts[flowIdx].trim().toUpperCase() as CsvContainer['flow_type'] : 'IMPORT'

    if (isNaN(containerId)) continue

    let dep = departureTime
    if (!dep.includes('T')) {
      const d = new Date(dep)
      dep = isNaN(d.getTime()) ? new Date(Date.now() + 5 * 86400000).toISOString() : d.toISOString()
    }

    result.push({
      container_id: containerId,
      weight_class: ['LIGHT', 'MEDIUM', 'HEAVY'].includes(weightClass) ? weightClass : 'MEDIUM',
      weight_kg: isNaN(weightKg) ? 18000 : weightKg,
      departure_time: dep,
      flow_type: ['IMPORT', 'EXPORT'].includes(flowType) ? flowType : 'IMPORT',
    })
  }
  return result
}

export function ControlPanel({
  onInitialize,
  onGateIn,
  onRemove,
  onBulkLoadCsv,
  lastResult,
  lastRemoval,
  selectedContainer,
  loading,
  error,
  connected,
  removingId,
  onShowPSO,
}: Props) {
  const [mode, setMode] = useState<Mode>('preenchimento')
  const [nextId, setNextId] = useState(1)
  const [weightClass, setWeightClass] = useState<'LIGHT' | 'MEDIUM' | 'HEAVY'>('MEDIUM')
  const [weightKg, setWeightKg] = useState(18000)
  const [flowType, setFlowType] = useState<'IMPORT' | 'EXPORT'>('EXPORT')
  const [depDays, setDepDays] = useState(5)
  const [csvParsed, setCsvParsed] = useState<CsvContainer[]>([])
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [csvLoadResult, setCsvLoadResult] = useState<string | null>(null)
  const [removeIdInput, setRemoveIdInput] = useState('')
  const [expanded, setExpanded] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleGateIn = async () => {
    const dep = new Date()
    dep.setDate(dep.getDate() + depDays)
    const result = await onGateIn({
      container_id: nextId,
      weight_class: weightClass,
      weight_kg: weightKg,
      departure_time: dep.toISOString(),
      flow_type: flowType,
      rtg_position: [0, 0],
      block_name: 'A1',
    })
    if (result) setNextId((n) => n + 1)
  }

  const handleBatchGateIn = async (count: number) => {
    const WEIGHTS: ('LIGHT' | 'MEDIUM' | 'HEAVY')[] = ['LIGHT', 'MEDIUM', 'HEAVY']
    const FLOWS: ('IMPORT' | 'EXPORT')[] = ['IMPORT', 'EXPORT']
    let id = nextId
    for (let i = 0; i < count; i++) {
      const wc = WEIGHTS[Math.floor(Math.random() * 3)]
      const wkg = wc === 'HEAVY' ? 24000 + Math.random() * 10000 : wc === 'MEDIUM' ? 12000 + Math.random() * 12000 : 2000 + Math.random() * 10000
      const dep = new Date()
      dep.setDate(dep.getDate() + 1 + Math.floor(Math.random() * 13))
      await onGateIn({
        container_id: id++,
        weight_class: wc,
        weight_kg: Math.round(wkg),
        departure_time: dep.toISOString(),
        flow_type: FLOWS[Math.floor(Math.random() * 2)],
        rtg_position: [Math.floor(Math.random() * 30), Math.floor(Math.random() * 6)],
        block_name: 'A1',
      })
    }
    setNextId(id)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    setCsvLoadResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCsv(text)
      setCsvParsed(parsed)
    }
    reader.readAsText(file)
  }

  const handleCsvLoad = async () => {
    if (csvParsed.length === 0) return
    const { success, errors } = await onBulkLoadCsv(csvParsed)
    const msg = `${success}/${csvParsed.length} contentores alocados com sucesso`
    setCsvLoadResult(errors.length > 0 ? `${msg}\nFalhas: ${errors.join('; ')}` : msg)
    setCsvParsed([])
    setCsvFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveById = async () => {
    const id = parseInt(removeIdInput)
    if (isNaN(id)) return
    await onRemove(id)
    setRemoveIdInput('')
  }

  const handleRemoveSelected = async () => {
    if (!selectedContainer) return
    await onRemove(selectedContainer.id)
  }

  return (
    <div className={`floating-controls ${expanded ? 'expanded' : 'collapsed'}`}>
      {/* Toggle + Mode tabs */}
      <div className="fc-header">
        <button className="fc-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▾' : '▴'} Controles
        </button>
        <div className="fc-tabs">
          <button
            className={`fc-tab ${mode === 'preenchimento' ? 'active' : ''}`}
            onClick={() => setMode('preenchimento')}
          >
            Preencher
          </button>
          <button
            className={`fc-tab ${mode === 'retirada' ? 'active' : ''}`}
            onClick={() => setMode('retirada')}
          >
            Retirada
          </button>
        </div>
        <button
          className="fc-init-btn"
          onClick={() => onInitialize(30, 6, 5, 'A1')}
          disabled={loading}
        >
          Inicializar Pátio
        </button>
      </div>

      {expanded && (
        <div className="fc-body">
          {/* ═══════ PREENCHIMENTO ═══════ */}
          {mode === 'preenchimento' && (
            <div className="fc-content">
              {/* CSV Upload compact */}
              <div className="fc-section">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="csv-file-input"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="fc-csv-btn">
                  {csvFileName ? `📄 ${csvFileName}` : '📂 Carregar CSV'}
                </label>
                {csvParsed.length > 0 && (
                  <button className="fc-action-btn primary" onClick={handleCsvLoad} disabled={loading}>
                    {loading ? 'Carregando...' : `Alocar ${csvParsed.length} containers`}
                  </button>
                )}
                {csvLoadResult && <span className="fc-feedback success">{csvLoadResult}</span>}
              </div>

              {/* Manual form - inline */}
              <div className="fc-form">
                <div className="fc-field">
                  <label>ID</label>
                  <input type="number" value={nextId} onChange={(e) => setNextId(+e.target.value)} />
                </div>
                <div className="fc-field">
                  <label>Peso</label>
                  <select value={weightClass} onChange={(e) => setWeightClass(e.target.value as any)}>
                    <option value="LIGHT">Light</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HEAVY">Heavy</option>
                  </select>
                </div>
                <div className="fc-field">
                  <label>Kg</label>
                  <input type="number" value={weightKg} onChange={(e) => setWeightKg(+e.target.value)} />
                </div>
                <div className="fc-field">
                  <label>Fluxo</label>
                  <select value={flowType} onChange={(e) => setFlowType(e.target.value as any)}>
                    <option value="IMPORT">Import</option>
                    <option value="EXPORT">Export</option>
                  </select>
                </div>
                <div className="fc-field">
                  <label>Dias</label>
                  <input type="number" value={depDays} min={1} max={30} onChange={(e) => setDepDays(+e.target.value)} />
                </div>
                <button className="fc-action-btn primary" onClick={handleGateIn} disabled={loading || !connected}>
                  {loading ? 'Alocando...' : 'Alocar'}
                </button>
              </div>

              {/* Batch */}
              <div className="fc-batch">
                <span className="fc-batch-label">Lote:</span>
                <button className="fc-batch-btn" onClick={() => handleBatchGateIn(10)} disabled={loading}>+10</button>
                <button className="fc-batch-btn" onClick={() => handleBatchGateIn(50)} disabled={loading}>+50</button>
                <button className="fc-batch-btn" onClick={() => handleBatchGateIn(100)} disabled={loading}>+100</button>
              </div>

              {/* Last result toast */}
              {lastResult && (
                <div className="fc-toast">
                  <span className="fc-toast-pos">Pos: ({lastResult.assigned_position.join(', ')})</span>
                  <span className="fc-toast-score">Custo: {lastResult.cost_score.toFixed(2)}</span>
                  <span className="fc-toast-meta">{lastResult.optimizer_type} · {lastResult.computation_ms}ms</span>
                  {lastResult.pso_history && lastResult.pso_history.length > 0 && (
                    <button
                      className="fc-pso-btn"
                      onClick={() => onShowPSO(
                        lastResult.pso_history!,
                        lastResult.assigned_position as [number, number, number],
                      )}
                    >
                      Ver PSO
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══════ RETIRADA ═══════ */}
          {mode === 'retirada' && (
            <div className="fc-content">
              {/* Remove by ID */}
              <div className="fc-remove-row">
                <input
                  type="number"
                  placeholder="Container ID"
                  value={removeIdInput}
                  onChange={(e) => setRemoveIdInput(e.target.value)}
                  className="fc-remove-input"
                />
                <button
                  className="fc-action-btn danger"
                  onClick={handleRemoveById}
                  disabled={loading || !removeIdInput}
                >
                  {loading && removingId ? 'Retirando...' : 'Retirar'}
                </button>
              </div>

              {/* Selected from 3D */}
              {selectedContainer && (
                <div className="fc-selected">
                  <div className="fc-selected-info">
                    <span className="fc-selected-id">#{selectedContainer.id}</span>
                    <span className="fc-selected-weight" style={{ color: selectedContainer.color }}>
                      {selectedContainer.weight_class}
                    </span>
                    <span className="fc-selected-pos">
                      B{selectedContainer.bay} R{selectedContainer.row} T{selectedContainer.tier}
                    </span>
                    {selectedContainer.tier > 0 && (
                      <span className="fc-reshuffle-warn">reshuffle necessário</span>
                    )}
                  </div>
                  <button
                    className="fc-action-btn danger"
                    onClick={handleRemoveSelected}
                    disabled={loading}
                  >
                    {loading && removingId === selectedContainer.id ? 'Retirando...' : `Retirar #${selectedContainer.id}`}
                  </button>
                </div>
              )}

              {!selectedContainer && (
                <span className="fc-hint">Clique num container no 3D para selecionar</span>
              )}

              {/* Last removal */}
              {lastRemoval && (
                <div className="fc-toast removal">
                  <span className="fc-toast-pos">#{lastRemoval.container_id} removido</span>
                  <span className="fc-toast-score">{lastRemoval.total_reshuffles} reshuffles</span>
                  {lastRemoval.reshuffles.length > 0 && (
                    <div className="fc-reshuffles">
                      {lastRemoval.reshuffles.map((r, i) => (
                        <span key={i} className="fc-reshuffle-move">
                          #{r.container_id}: ({r.from_position.join(',')}) → ({r.to_position.join(',')})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <div className="fc-error">{error}</div>}
        </div>
      )}
    </div>
  )
}
