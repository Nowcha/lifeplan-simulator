interface StatTileProps {
  label: string
  value: string
  detail?: string
  tone?: 'default' | 'critical'
}

export function StatTile({ label, value, detail, tone = 'default' }: StatTileProps) {
  return (
    <div className="flex flex-col gap-1.5 border-t-2 border-ink pt-3">
      <span className="text-xs tracking-wide text-ink-muted uppercase">{label}</span>
      <span
        className={`tabular text-3xl font-medium leading-none ${
          tone === 'critical' ? 'text-critical' : 'text-ink'
        }`}
      >
        {value}
      </span>
      {detail && <span className="text-sm text-ink-secondary">{detail}</span>}
    </div>
  )
}
