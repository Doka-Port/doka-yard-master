interface Props {
  value: number
  onChange: (hours: number) => void
}

export function TimelineSlider({ value, onChange }: Props) {
  if (value === 0 && !document.querySelector('.timeline-slider:hover')) {
    // Show collapsed state
  }

  const simDate = new Date(Date.now() + value * 3600_000)
  const label = value === 0
    ? 'Agora'
    : `+${value}h — ${simDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${simDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <div className="timeline-slider">
      <span className="timeline-icon" title="Time Travel">⏳</span>
      <input
        type="range"
        min={0}
        max={48}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="timeline-range"
      />
      <span className="timeline-label">{label}</span>
    </div>
  )
}
