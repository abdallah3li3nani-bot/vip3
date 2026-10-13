import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { cn, colorFromString, initials } from '@/lib/utils'

/* ============================== الأزرار ============================== */
const buttonVariants = cva(
  'tap inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--brand)] text-white shadow-[var(--shadow-1)] hover:brightness-110',
        secondary: 'bg-surface-2 text-ink border border-line hover:bg-surface-3',
        outline: 'border border-line-strong text-ink hover:bg-surface-2',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        danger: 'bg-danger text-white hover:brightness-110',
        success: 'bg-success text-white hover:brightness-110',
        subtle: 'bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)] hover:bg-[color-mix(in_oklab,var(--brand)_20%,transparent)]',
      },
      size: {
        sm: 'h-9 px-3 text-[13px]',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
        iconSm: 'h-8 w-8 p-0 rounded-lg',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, loading, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, block }), className)

    /**
     * مع asChild يستخدم Radix مكوّن Slot، وهو يقبل عنصرًا واحدًا فقط.
     * تمرير أيقونة التحميل بجانب المحتوى — حتى لو كانت null — يجعله يرمي:
     * "Slot failed to slot onto its children".
     * لذلك نمرّر children وحدها في هذه الحالة.
     */
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      )
    }

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'

/* ============================== البطاقات ============================== */
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'print-card rounded-2xl border border-line bg-surface shadow-[var(--shadow-1)]',
        className,
      )}
      {...p}
    />
  )
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 p-4 pb-3', className)} {...p} />
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[15px] font-bold text-ink', className)} {...p} />
}
export function CardDescription({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13px] text-ink-2', className)} {...p} />
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-0', className)} {...p} />
}
export function CardFooter({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 border-t border-line p-4', className)} {...p} />
}

/* ============================== الحقول ============================== */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none transition',
        'placeholder:text-muted focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--ring)]',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[92px] w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none transition',
        'placeholder:text-muted focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--ring)]',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-11 w-full appearance-none rounded-xl border border-line bg-surface px-3 pl-9 text-sm text-ink outline-none transition',
          'focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--ring)]',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </div>
  ),
)
Select.displayName = 'Select'

export function Label({ className, required, ...p }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('mb-1.5 block text-[13px] font-semibold text-ink-2', className)} {...p}>
      {p.children}
      {required ? <span className="text-danger"> *</span> : null}
    </label>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full', className)}>
      {label ? <Label required={required}>{label}</Label> : null}
      {children}
      {error ? (
        <p className="mt-1 text-[12px] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/* ============================== الشارات ============================== */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-2 text-ink-2 border border-line',
        brand: 'bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] text-[var(--brand)]',
        success: 'bg-success-bg text-success',
        warning: 'bg-warning-bg text-warning',
        danger: 'bg-danger-bg text-danger',
        info: 'bg-info-bg text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)
const BADGE_VARIANT_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
  default: 'brand',
  secondary: 'neutral',
  outline: 'neutral',
  warning: 'warning',
  info: 'info',
  success: 'success',
  danger: 'danger',
  destructive: 'danger',
}
export function Badge({
  className,
  tone,
  variant,
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { variant?: string }) {
  const t = tone ?? (variant ? BADGE_VARIANT_TONE[variant] : undefined)
  return <span className={cn(badgeVariants({ tone: t }), className)} {...p} />
}

/* ============================== مفاتيح ============================== */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'data-[state=checked]:bg-[var(--brand)] data-[state=unchecked]:bg-surface-3',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow ring-0 transition-transform data-[state=checked]:-translate-x-5 data-[state=unchecked]:-translate-x-0.5" />
    </SwitchPrimitive.Root>
  )
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'size-5 shrink-0 rounded-md border-2 border-line-strong transition',
        'data-[state=checked]:border-[var(--brand)] data-[state=checked]:bg-[var(--brand)] data-[state=checked]:text-white',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export function Progress({ value = 0, className, tone = 'brand' }: { value?: number; className?: string; tone?: 'brand' | 'success' | 'warning' }) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--brand)'
  return (
    <ProgressPrimitive.Root className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <ProgressPrimitive.Indicator
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </ProgressPrimitive.Root>
  )
}

export function Separator({ className, ...p }: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return <SeparatorPrimitive.Root className={cn('bg-line', 'h-px w-full', className)} {...p} />
}

/* ============================== الصورة الرمزية ============================== */
export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const bg = colorFromString(name || '?')
  return (
    <div
      className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white', className)}
      style={{ width: size, height: size, background: src ? undefined : bg, fontSize: size * 0.38 }}
    >
      {src ? <img src={src} alt={name} className="size-full object-cover" loading="lazy" /> : initials(name)}
    </div>
  )
}

/* ============================== هيكل التحميل ============================== */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/* ============================== مجموعة أزرار ============================== */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('inline-flex rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'tap rounded-lg font-semibold transition-all',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
            value === o.value
              ? 'bg-surface text-ink shadow-[var(--shadow-1)]'
              : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ============================== ثنائيات نصية ============================== */
export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 py-2', className)}>
      <span className="shrink-0 text-[13px] text-ink-2">{label}</span>
      <span className="text-left text-[13px] font-semibold text-ink">{children}</span>
    </div>
  )
}
