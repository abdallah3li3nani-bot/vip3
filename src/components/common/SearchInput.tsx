import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SearchInput({
  value,
  onChange,
  placeholder = 'ابحث…',
  className,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  const [local, setLocal] = useState(value)

  useEffect(() => setLocal(value), [value])
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local)
    }, 220)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        autoFocus={autoFocus}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        inputMode="search"
        className="h-11 w-full rounded-xl border border-line bg-surface pr-10 pl-9 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--ring)]"
      />
      {local ? (
        <button
          type="button"
          onClick={() => {
            setLocal('')
            onChange('')
          }}
          className="absolute left-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="مسح البحث"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
