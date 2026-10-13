import { useState } from 'react'
import { Lock, School, KeyRound, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { Button, Card, Field, Input } from '@/components/ui'

export default function LoginPage() {
  const { unlock } = useAuth()
  const { settings } = useSettings()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password.trim()) {
      toast.error('يرجى إدخال كلمة المرور')
      return
    }

    setBusy(true)
    try {
      const ok = await unlock(password)
      if (!ok) {
        toast.error('كلمة المرور غير صحيحة')
      } else {
        toast.success('مرحباً بك!')
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg p-5">
      <div
        className="pointer-events-none absolute -top-40 right-1/2 size-[560px] translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${settings.primary_color || '#2563eb'}, transparent 65%)` }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="" className="size-16 rounded-2xl object-cover shadow-[var(--shadow-2)]" />
          ) : (
            <span className="grid size-16 place-items-center rounded-2xl bg-[var(--brand)] text-white shadow-[var(--shadow-2)]">
              <School className="size-8" />
            </span>
          )}
          <h1 className="mt-4 text-2xl font-extrabold text-ink">{settings.app_name || 'منصّة المعلّم'}</h1>
          <p className="mt-1 text-[13px] text-ink-2">إدارة الدروس والطلاب والمذكرات (أوفلاين)</p>
        </div>

        <Card className="p-6 shadow-[var(--shadow-2)]">
          <div className="mb-4 text-center">
            <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-brand-soft text-[var(--brand)]">
              <KeyRound className="size-6" />
            </div>
            <h2 className="text-base font-bold text-ink">قفل التطبيق</h2>
            <p className="text-xs text-muted">أدخل كلمة المرور لفتح التطبيق</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="كلمة المرور">
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  className="px-10 text-center font-mono text-lg tracking-widest"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="tap absolute left-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <Button type="submit" className="w-full" size="lg" loading={busy}>
              فتح التطبيق
            </Button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-[11px] text-muted">
              كلمة المرور الافتراضية هي <span className="font-mono font-bold text-ink">1234</span> ويمكنك تغييرها من الإعدادات.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
