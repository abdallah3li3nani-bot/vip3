import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  icon: Icon,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)]">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
