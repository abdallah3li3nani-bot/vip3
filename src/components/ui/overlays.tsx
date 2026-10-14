import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './primitives'

/* ================================ نافذة ================================ */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const w = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size]
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border border-line bg-surface shadow-[var(--shadow-3)] outline-none',
            'data-[state=open]:animate-fade-up',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            w,
            className && className.replace(/(^|\s)max-w-/g, '$1sm:max-w-'),
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-bold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-ink-2">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label="إغلاق">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer ? <div className="safe-b flex items-center justify-end gap-2 border-t border-line p-4">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ============================ لوحة جانبية ============================ */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  side = 'right',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: React.ReactNode
  children: React.ReactNode
  side?: 'right' | 'left'
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn(
            'fixed inset-y-0 z-50 flex w-[86%] max-w-xs flex-col border-line bg-surface shadow-[var(--shadow-3)] outline-none',
            side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          )}
        >
          {title ? (
            <div className="flex items-center justify-between border-b border-line p-4">
              <DialogPrimitive.Title className="font-bold text-ink">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="iconSm"><X className="size-4" /></Button>
              </DialogPrimitive.Close>
            </div>
          ) : (
            <DialogPrimitive.Title className="sr-only">القائمة</DialogPrimitive.Title>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ============================ تأكيد الحذف ============================ */
interface ConfirmState {
  title: string
  message?: React.ReactNode
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'brand'
  /** مرادف قديم: destructive=true يعني tone='danger' */
  destructive?: boolean
  /** طلب كلمة سر التطبيق قبل التنفيذ (للحذف المهم) */
  requirePassword?: boolean
  onConfirm?: () => void | Promise<void>
  /** يُستدعى داخلياً لإرجاع نتيجة await confirm(...) */
  _resolve?: (ok: boolean) => void
}

type ConfirmFn = (s: ConfirmState) => Promise<boolean>
const ConfirmCtx = React.createContext<ConfirmFn>(async () => false)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [pass, setPass] = React.useState('')
  const [passErr, setPassErr] = React.useState('')

  const close = React.useCallback(() => {
    setState((cur) => {
      cur?._resolve?.(false)
      return null
    })
  }, [])

  const run = React.useCallback(async () => {
    if (!state) return
    if (state.requirePassword) {
      const { getSettings } = await import('@/lib/api')
      const s = await getSettings()
      if (pass.trim() !== String(s.password || '1234').trim()) {
        setPassErr('كلمة السر غير صحيحة')
        return
      }
    }
    try {
      setBusy(true)
      if (state.onConfirm) await state.onConfirm()
      state._resolve?.(true)
      setState(null)
    } finally {
      setBusy(false)
    }
  }, [state, pass])

  React.useEffect(() => {
    setPass('')
    setPassErr('')
  }, [state])

  /** يدعم الأسلوبين: confirm({ onConfirm }) أو const ok = await confirm({...}) */
  const ask = React.useCallback<ConfirmFn>((s) => {
    return new Promise<boolean>((resolve) => {
      setState((cur) => {
        cur?._resolve?.(false)
        return { ...s, _resolve: resolve }
      })
    })
  }, [])

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        onOpenChange={(v) => !v && close()}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <span className={cn('grid size-8 place-items-center rounded-full', state?.tone === 'brand' ? 'bg-info-bg text-info' : 'bg-danger-bg text-danger')}>
              <AlertTriangle className="size-4" />
            </span>
            {state?.title}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {state?.cancelText ?? 'إلغاء'}
            </Button>
            <Button variant={state?.tone === 'brand' ? 'primary' : 'danger'} onClick={run} loading={busy}>
              {state?.confirmText ?? 'تأكيد الحذف'}
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-ink-2">
          {state?.message ?? 'لا يمكن التراجع عن هذه العملية.'}
        </p>
        {state?.requirePassword && (
          <form
            className="mt-3 space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              run()
            }}
          >
            <label className="text-[12.5px] font-bold text-ink">اكتب كلمة سر التطبيق للتأكيد</label>
            <input
              type="password"
              autoFocus
              value={pass}
              onChange={(e) => {
                setPass(e.target.value)
                setPassErr('')
              }}
              className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-[var(--brand)]"
              placeholder="••••"
              autoComplete="current-password"
            />
            {passErr && <p className="text-[12px] font-bold text-danger">{passErr}</p>}
          </form>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export const useConfirm = () => React.useContext(ConfirmCtx)

/* ============================ قائمة منسدلة ============================ */
export const Dropdown = (p: React.ComponentProps<typeof DropdownPrimitive.Root>) => (
  <DropdownPrimitive.Root dir="rtl" {...p} />
)
export const DropdownTrigger = DropdownPrimitive.Trigger

export function DropdownContent({ className, children, align = 'end', ...p }: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[190px] overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-3)] data-[state=open]:animate-pop',
          className,
        )}
        {...p}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  )
}

export function DropdownItem({ className, danger, ...p }: React.ComponentProps<typeof DropdownPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium outline-none transition',
        danger ? 'text-danger data-[highlighted]:bg-danger-bg' : 'text-ink data-[highlighted]:bg-surface-2',
        className,
      )}
      {...p}
    />
  )
}

export const DropdownSeparator = () => <DropdownPrimitive.Separator className="my-1 h-px bg-line" />

/* ============================ نافذة منبثقة ============================ */
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export function PopoverContent({ className, ...p }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={8}
        className={cn('z-50 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-3)] data-[state=open]:animate-pop', className)}
        {...p}
      />
    </PopoverPrimitive.Portal>
  )
}
