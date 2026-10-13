import * as React from 'react'
import { Inbox, RefreshCw, ServerCrash, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Card, Skeleton } from './primitives'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <div className="grid size-16 place-items-center rounded-2xl bg-surface-2 text-muted">
        <Icon className="size-7" />
      </div>
      <div>
        <p className="text-[15px] font-bold text-ink">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-2">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const msg = (error as { message?: string })?.message ?? 'تعذّر تحميل البيانات'
  return (
    <EmptyState
      icon={ServerCrash}
      title="حصل خطأ أثناء التحميل"
      description={msg}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" /> إعادة المحاولة
          </Button>
        ) : undefined
      }
    />
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-muted', className)} />
}

export function PageLoader({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted">
      <Spinner className="size-7" />
      <p className="text-[13px]">{label}</p>
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="flex items-center gap-3 p-3.5">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </Card>
      ))}
    </div>
  )
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="space-y-3 p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-3/4" />
        </Card>
      ))}
    </div>
  )
}
