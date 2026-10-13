import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * عرض مبلغ مالي مع احترام زر «إخفاء الأرصدة».
 * عند الإخفاء يظهر •••••• بدلًا من الرقم في كل مكان بالتطبيق.
 */
export function Money({
  value,
  className,
  force,
  showSymbol = true,
}: {
  value: number | null | undefined
  className?: string
  /** تجاهل الإخفاء (يُستخدم داخل نموذج إدخال مثلاً) */
  force?: boolean
  showSymbol?: boolean
}) {
  const hide = useUi((s) => s.hideBalances)
  const { settings } = useSettings()
  if (hide && !force) {
    return (
      <span className={cn('num select-none tracking-[.18em] text-muted', className)} aria-label="مخفي">
        ••••••
      </span>
    )
  }
  return (
    <span className={cn('num', className)}>
      {showSymbol ? fmtMoney(value, settings.currency_symbol) : Number(value ?? 0).toLocaleString('en-US')}
    </span>
  )
}

export function useMoneyText() {
  const hide = useUi((s) => s.hideBalances)
  const { settings } = useSettings()
  return (v: number | null | undefined) => (hide ? '••••••' : fmtMoney(v, settings.currency_symbol))
}
