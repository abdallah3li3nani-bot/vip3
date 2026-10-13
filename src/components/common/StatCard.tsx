import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui'

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  onClick,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: React.ComponentType<{ className?: string }>
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
  onClick?: () => void
  className?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-2 text-ink-2',
    brand: 'bg-[color-mix(in_oklab,var(--brand)_13%,transparent)] text-[var(--brand)]',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    danger: 'bg-danger-bg text-danger',
    info: 'bg-info-bg text-info',
  }
  return (
    <Card
      onClick={onClick}
      className={cn(
        'animate-fade-up p-4 transition',
        onClick && 'tap cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-ink-2">{label}</p>
        {Icon ? (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tones[tone])}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[22px] font-extrabold leading-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </Card>
  )
}
