import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X, Sparkles } from 'lucide-react'

/** كل قد إيه التطبيق يسأل السيرفر عن نسخة جديدة */
const CHECK_EVERY_MS = 5 * 60 * 1000

/**
 * شريط «يوجد تحديث جديد»:
 * - التطبيق بيفحص كل 5 دقائق، وكمان كل ما ترجع للتطبيق من الخلفية.
 * - لما يلاقي نسخة جديدة يظهر الشريط، والضغط على «تحديث الآن» يركّب النسخة ويعيد التحميل.
 * - البيانات المحفوظة على الجهاز لا تتأثر بالتحديث.
 */
export function UpdatePrompt() {
  const [updating, setUpdating] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, reg) {
      if (!reg) return
      const check = async () => {
        if (!navigator.onLine || reg.installing) return
        try {
          // نتأكد إن السيرفر متاح قبل طلب التحديث حتى لا تظهر أخطاء وانت أوفلاين
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })
          if (res.status === 200) await reg.update()
        } catch {
          /* أوفلاين: نحاول لاحقاً */
        }
      }
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
  })

  // رسالة «جاهز للعمل بدون إنترنت» تختفي وحدها
  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null

  return (
    <div
      dir="rtl"
      role="status"
      className="no-print fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md animate-fade-up lg:bottom-5"
    >
      {needRefresh ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--brand)]/40 bg-surface p-3.5 shadow-[var(--shadow-3)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] text-[var(--brand)]">
            <Sparkles className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-ink">يوجد تحديث جديد للتطبيق</p>
            <p className="text-[12px] text-ink-2">بياناتك محفوظة ولن تتأثر بالتحديث</p>
          </div>
          <button
            type="button"
            disabled={updating}
            onClick={async () => {
              setUpdating(true)
              await updateServiceWorker(true)
              // احتياطي لو المتصفح ما أعادش التحميل تلقائياً
              setTimeout(() => window.location.reload(), 2500)
            }}
            className="tap inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3.5 py-2 text-[13px] font-bold text-white shadow-sm disabled:opacity-70"
          >
            <RefreshCw className={`size-4 ${updating ? 'animate-spin' : ''}`} />
            {updating ? 'جارٍ التحديث…' : 'تحديث الآن'}
          </button>
          {!updating && (
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              aria-label="لاحقاً"
              title="لاحقاً"
              className="tap grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-surface p-3 text-center text-[13px] font-semibold text-emerald-600 shadow-[var(--shadow-2)]">
          التطبيق جاهز للعمل بدون إنترنت ✓
        </div>
      )}
    </div>
  )
}
