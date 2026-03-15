const BLOCKS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

interface Props {
  activeBlock: string
  onSwitch: (block: string) => void
}

export function MiniMap({ activeBlock, onSwitch }: Props) {
  return (
    <div className="minimap">
      <div className="minimap-title">Blocos</div>
      <div className="minimap-grid">
        {BLOCKS.map(b => (
          <button
            key={b}
            className={`minimap-btn ${b === activeBlock ? 'active' : ''}`}
            onClick={() => onSwitch(b)}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  )
}
