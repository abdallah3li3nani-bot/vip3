import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Database, DollarSign, Palette, Settings as SettingsIcon, Shield, Download,
  Upload, HardDrive, Share2, FolderHeart, CheckCircle2, AlertTriangle, KeyRound,
  RotateCcw, Trash2, Moon, Sun, MonitorSmartphone, Lock, Eye, EyeOff,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input,
  Segmented, Select, Switch, Textarea, useConfirm,
} from '@/components/ui'
import { useAction, useBackups, useStorage } from '@/lib/hooks'
import * as api from '@/lib/api'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useAuth } from '@/store/auth'
import type { AppSettings } from '@/lib/database.types'
import { downloadBlob, exportCsv } from '@/lib/utils'
import { fmtDate, fmtDateTime } from '@/lib/format'

const TABS = [
  { v: 'app', label: 'التطبيق', Icon: SettingsIcon },
  { v: 'security', label: 'الأمان والقفل', Icon: Shield },
  { v: 'backup', label: 'النسخ وحماية البيانات', Icon: Database },
  { v: 'branding', label: 'الهوية البصرية', Icon: Palette },
  { v: 'financial', label: 'المالية', Icon: DollarSign },
]

export default function SettingsPage() {
  const { tab } = useParams()
  const nav = useNavigate()
  const active = TABS.some((t) => t.v === tab) ? tab! : 'app'
  const { settings, reload } = useSettings()
  const [form, setForm] = useState<AppSettings>(settings)

  useEffect(() => setForm(settings), [settings])

  const save = useAction(async (patch: Partial<AppSettings>) => api.saveSettings(patch), {
    success: 'تم حفظ الإعدادات بنجاح ✓',
    onDone: () => reload(),
  })

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setForm({ ...form, [k]: v })

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="الإعدادات وحماية البيانات"
        icon={SettingsIcon}
        subtitle="إدارة قفل التطبيق، النسخ الاحتياطي التلقائي (آخر 5 نسخ)، والبيانات العامة"
      />

      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.v}
            onClick={() => nav(t.v === 'app' ? '/settings' : `/settings/${t.v}`)}
            className={`tap flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
              active === t.v
                ? 'bg-[var(--brand)] text-white shadow-sm'
                : 'text-ink-2 hover:bg-surface-2'
            }`}
          >
            <t.Icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {active === 'app' && (
        <SectionCard
          title="بيانات التطبيق والمدرّس"
          onSave={() =>
            save.mutate({
              app_name: form.app_name,
              short_name: form.short_name,
              tagline: form.tagline,
              teacher_name: form.teacher_name,
              report_header: form.report_header,
              report_footer: form.report_footer,
            })
          }
          busy={save.isPending}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم التطبيق" required>
              <Input value={form.app_name} onChange={(e) => set('app_name', e.target.value)} />
            </Field>
            <Field label="الاسم المختصر (يظهر أسفل الأيقونة)">
              <Input value={form.short_name} onChange={(e) => set('short_name', e.target.value)} />
            </Field>
            <Field label="اسم المدرّس">
              <Input value={form.teacher_name ?? ''} onChange={(e) => set('teacher_name', e.target.value)} />
            </Field>
            <Field label="الوصف / الشعار">
              <Input value={form.tagline ?? ''} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
            <Field label="نص أعلى التقارير المطبوعة" className="sm:col-span-2">
              <Textarea value={form.report_header ?? ''} onChange={(e) => set('report_header', e.target.value)} placeholder="مثال: سنتر الأستاذ — كشف درجات ومذكرات" />
            </Field>
          </div>
        </SectionCard>
      )}

      {active === 'security' && <SecurityTab />}

      {active === 'backup' && <BackupTab />}

      {active === 'branding' && <BrandingTab form={form} set={set} onSave={() => save.mutate(form)} busy={save.isPending} />}

      {active === 'financial' && (
        <SectionCard
          title="الإعدادات المالية العامة"
          onSave={() =>
            save.mutate({
              currency: form.currency,
              currency_symbol: form.currency_symbol,
            })
          }
          busy={save.isPending}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="رمز العملة">
              <Input value={form.currency_symbol} onChange={(e) => set('currency_symbol', e.target.value)} />
            </Field>
            <Field label="كود العملة">
              <Input value={form.currency} onChange={(e) => set('currency', e.target.value)} />
            </Field>
          </div>
        </SectionCard>
      )}
    </div>
  )
}

function SectionCard({
  title,
  children,
  onSave,
  busy,
}: {
  title: string
  children: React.ReactNode
  onSave?: () => void
  busy?: boolean
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {onSave && (
          <Button size="sm" onClick={onSave} loading={busy}>
            حفظ التغييرات
          </Button>
        )}
      </div>
      {children}
    </Card>
  )
}

/* ========================================================================== */
/*                                تبويب الأمان والقفل                          */
/* ========================================================================== */
function SecurityTab() {
  const { changePassword, lock } = useAuth()
  const { settings, updateSettings } = useSettings()

  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (!newPass.trim()) {
      toast.error('يرجى كتابة كلمة المرور الجديدة')
      return
    }
    if (newPass !== confirmPass) {
      toast.error('كلمتا المرور غير متطابقتين')
      return
    }
    const realStored = settings.password || '1234'
    if (currentPass !== realStored) {
      toast.error('كلمة المرور الحالية غير صحيحة')
      return
    }

    setBusy(true)
    try {
      await changePassword(newPass)
      toast.success('تم تغيير كلمة المرور بنجاح ✓')
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard title="قفل التطبيق بكلمة سر">
        <form onSubmit={handlePasswordChange} className="space-y-3.5 max-w-md">
          <Field label="كلمة المرور الحالية" required hint="الافتراضية: 1234">
            <div className="relative">
              <Input
                type={showPass ? 'text' : 'password'}
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                placeholder="أدخل كلمة المرور الحالية"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="tap absolute left-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>

          <Field label="كلمة المرور الجديدة" required>
            <Input
              type={showPass ? 'text' : 'password'}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="••••"
              required
            />
          </Field>

          <Field label="تأكيد كلمة المرور الجديدة" required>
            <Input
              type={showPass ? 'text' : 'password'}
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="••••"
              required
            />
          </Field>

          <div className="pt-2 flex gap-2">
            <Button type="submit" loading={busy}>
              حفظ كلمة المرور الجديدة
            </Button>
            <Button type="button" variant="secondary" onClick={lock}>
              قفل التطبيق الآن
            </Button>
          </div>
        </form>
      </SectionCard>

      <Card className="p-4 border-blue-500/20 bg-blue-500/5">
        <div className="flex items-start gap-3">
          <Lock className="size-5 text-[var(--brand)] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1 text-ink">
            <p className="font-bold">حماية التطبيق بدون إنترنت</p>
            <p className="text-muted leading-relaxed">
              كلمة المرور مخزنة بأمان داخل ذاكرة هاتفك المشفرة ولا تخرج لأي خادم خارجي. التطبيق يطلب كلمة المرور عند الفتح لحماية بيانات الطلاب والمذكرات.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ========================================================================== */
/*                       تبويب النسخ الاحتياطي وحماية البيانات                */
/* ========================================================================== */
function BackupTab() {
  const { settings, reload } = useSettings()
  const { data: backups = [], isLoading, refetch } = useBackups()
  const { data: storageInfo, refetch: refetchStorage } = useStorage()
  const confirm = useConfirm()

  const [busy, setBusy] = useState(false)
  const [folderSupport, setFolderSupport] = useState(false)

  useEffect(() => {
    // التحقق من دعم المتصفح لاختيار المجلد المباشر
    setFolderSupport(typeof window !== 'undefined' && 'showDirectoryPicker' in window)
  }, [])

  // تفعيل التخزين الدائم يدوياً
  async function activatePersistence() {
    setBusy(true)
    try {
      const ok = await api.ensureStoragePersistence()
      if (ok) {
        toast.success('تم تفعيل التخزين الدائم بنجاح من نظام الهاتف ✓')
      } else {
        toast.info('تم تقديم طلب التخزين الدائم للنظام')
      }
      refetchStorage()
    } catch {
      toast.error('تعذر تفعيل التخزين الدائم')
    } finally {
      setBusy(false)
    }
  }

  // تصدير نسخة احتياطية فورية وتنزيلها
  async function downloadFullBackup() {
    setBusy(true)
    try {
      const json = await api.exportBackupJSON()
      const filename = `moallem_backup_${new Date().toISOString().slice(0, 10)}.json`
      downloadBlob(json, filename, 'application/json')
      await api.markFileBackupDone()
      reload()
      toast.success('تم تنزيل النسخة الاحتياطية بنجاح ✓')
    } catch (err) {
      toast.error('تعذر إنشاء النسخة الاحتياطية')
    } finally {
      setBusy(false)
    }
  }

  // حفظ في مجلد يختاره المستخدم على الهاتف
  async function saveToSelectedFolder() {
    if (!('showSaveFilePicker' in window)) {
      // للأجهزة التي لا تدعم showSaveFilePicker نستخدم التنزيل المباشر
      downloadFullBackup()
      return
    }

    try {
      setBusy(true)
      const json = await api.exportBackupJSON()
      const filename = `moallem_backup_${new Date().toISOString().slice(0, 10)}.json`

      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }],
      })

      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      await api.markFileBackupDone()
      reload()
      toast.success('تم حفظ النسخة الاحتياطية في المجلد المحدد بنجاح ✓')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error('تعذر الحفظ في المجلد')
      }
    } finally {
      setBusy(false)
    }
  }

  // استعادة نسخة احتياطية من ملف خارجي
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ok = await confirm({
      title: 'استعادة نسخة احتياطية',
      message: `تنبيه: استعادة النسخة من «${file.name}» ستقوم باستبدال كافة البيانات الحالية ببيانات النسخة الاحتياطية. هل تريد المتابعة؟`,
      confirmText: 'نعم، استعد البيانات',
      destructive: true,
    })

    if (!ok) return

    setBusy(true)
    try {
      const text = await file.text()
      await api.importBackupJSON(text)
      toast.success('تمت استعادة كافة البيانات بنجاح! جارٍ تحديث الشاشة...')
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (err) {
      toast.error('ملف النسخة الاحتياطية غير صالح أو تالف')
    } finally {
      setBusy(false)
    }
  }

  // مشاركة النسخة الاحتياطية عبر الواتساب أو Google Drive
  async function shareBackup() {
    try {
      setBusy(true)
      const json = await api.exportBackupJSON()
      const filename = `moallem_backup_${new Date().toISOString().slice(0, 10)}.json`
      const file = new File([json], filename, { type: 'application/json' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'نسخة احتياطية لتطبيق المعلم',
          text: `نسخة احتياطية بتاريخ ${new Date().toISOString().slice(0, 10)}`,
          files: [file],
        })
        await api.markFileBackupDone()
        reload()
      } else {
        downloadFullBackup()
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        downloadFullBackup()
      }
    } finally {
      setBusy(false)
    }
  }

  const lastFile = settings.last_file_backup_at
  const daysSince = lastFile ? Math.floor((Date.now() - new Date(lastFile).getTime()) / 86400000) : null

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${daysSince === null || daysSince >= 7 ? 'border-warning/40 bg-warning-bg' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-ink">آخر نسخة محفوظة كملف على جهازك</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              {daysSince === null
                ? 'لم تحفظ أي نسخة كملف بعد. النسخ التلقائية محفوظة داخل المتصفح فقط وتضيع لو اتمسحت بيانات المتصفح.'
                : daysSince === 0
                  ? 'اليوم ✓'
                  : `منذ ${daysSince} يوم${daysSince >= 7 ? ' — يُنصح بحفظ نسخة الآن' : ''}`}
            </p>
          </div>
          <Button size="sm" onClick={downloadFullBackup} loading={busy}>حفظ نسخة على الجهاز الآن</Button>
        </div>
      </Card>

      {/* بطاقة حالة حماية التخزين الدائم */}
      <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <HardDrive className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-ink">حماية البيانات والتخزين الدائم</span>
                {storageInfo?.persisted ? (
                  <Badge variant="default" className="bg-emerald-600 text-[10px]">مُفعّل ومحمي ✓</Badge>
                ) : (
                  <Badge variant="warning" className="text-[10px]">قيد المراجعة</Badge>
                )}
              </div>
              <p className="text-xs text-muted leading-relaxed">
                {storageInfo?.persisted
                  ? 'بيانات التطبيق محمية بالكامل ولن يقوم الهاتف بحذفها مطلقاً عند تنظيف الذاكرة المؤقتة.'
                  : 'يمكنك طلب حماية التخزين من نظام الهاتف لمنع مسح البيانات تلقائياً.'}
              </p>
            </div>
          </div>

          {!storageInfo?.persisted && (
            <Button size="sm" onClick={activatePersistence} loading={busy}>
              تفعيل الحماية الدائمة
            </Button>
          )}
        </div>
      </Card>

      {/* إجراءات النسخ السريعة واختيار مجلد على الهاتف */}
      <SectionCard title="تصدير وحفظ النسخة الاحتياطية على هاتفك">
        <p className="text-xs text-muted leading-relaxed mb-4">
          احفظ نسخة احتياطية من كل بياناتك (الطلاب، الحصص، المذكرات، الحسابات) في ملف على هاتفك أو في مجلد تختاره.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <Button onClick={saveToSelectedFolder} loading={busy} className="justify-center">
            <FolderHeart className="size-4" /> حفظ في مجلد بالهاتف
          </Button>

          <Button variant="secondary" onClick={downloadFullBackup} loading={busy} className="justify-center">
            <Download className="size-4" /> تنزيل ملف النسخة (JSON)
          </Button>

          <Button variant="secondary" onClick={shareBackup} loading={busy} className="justify-center">
            <Share2 className="size-4" /> مشاركة (واتساب / درايف)
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold text-ink">استعادة نسخة احتياطية سابقة</p>
            <p className="text-[11px] text-muted">اختر ملف نسخة احتياطية (.json) محفوظ مسبقاً لاسترجاع كافة البيانات فوراً</p>
          </div>

          <label className="tap inline-flex items-center gap-1.5 cursor-pointer rounded-xl border border-[var(--border)] bg-surface-2 px-3 py-2 text-xs font-bold text-ink hover:bg-surface">
            <Upload className="size-4" /> اختيار ملف النسخة
            <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </label>
        </div>
      </SectionCard>

      {/* سجل النسخ التلقائية اليومية (آخر 5 نسخ) */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <h3 className="text-sm font-bold text-ink">النسخ الاحتياطية التلقائية اليومية</h3>
            <p className="text-xs text-muted">يحتفظ التطبيق تلقائياً بآخر 5 نسخ يومية فقط ويحذف الأقدم تلقائياً</p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {backups.length} / 5 نسخ محفوظة
          </Badge>
        </div>

        {backups.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            سيتم أخذ أول لقطة يومية تلقائياً عند استخدام التطبيق اليوم.
          </p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-surface p-3 transition-all hover:bg-surface-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink">{b.label}</span>
                    <Badge variant="secondary" className="text-[10px]">{b.date}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {b.students_count} طالب • {b.orders_count} طلب مذكرات
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'استرجاع النسخة التلقائية',
                        message: `هل أنت متأكد من استرجاع بيانات يوم ${b.date}؟ سيتم استبدال البيانات الحالية.`,
                        confirmText: 'نعم، استرجع',
                        tone: 'danger',
                      })
                      if (ok) {
                        await api.restoreBackupById(b.id)
                        toast.success('تم استرجاع النسخة بنجاح ✓')
                        setTimeout(() => window.location.reload(), 1000)
                      }
                    }}
                  >
                    <RotateCcw className="size-3.5" /> استرجاع
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      downloadBlob(b.dump_json, `moallem_snapshot_${b.date}.json`, 'application/json')
                      toast.success('تم تنزيل النسخة ✓')
                    }}
                  >
                    <Download className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function BrandingTab({
  form,
  set,
  onSave,
  busy,
}: {
  form: AppSettings
  set: <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void
  onSave: () => void
  busy?: boolean
}) {
  const { theme, setTheme } = useUi()

  return (
    <SectionCard title="الهوية البصرية والمظهر" onSave={onSave} busy={busy}>
      <div className="space-y-4">
        <Field label="وضع العرض المفضل">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="size-3.5" /> نهاري</span> },
              { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5" /> ليلي داكن</span> },
              { value: 'system', label: <span className="inline-flex items-center gap-1.5"><MonitorSmartphone className="size-3.5" /> تلقائي</span> },
            ]}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اللون الأساسي">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => set('primary_color', e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-surface p-1"
              />
              <Input dir="ltr" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} />
            </div>
          </Field>

          <Field label="اللون الثانوي">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.accent_color}
                onChange={(e) => set('accent_color', e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-surface p-1"
              />
              <Input dir="ltr" value={form.accent_color} onChange={(e) => set('accent_color', e.target.value)} />
            </div>
          </Field>
        </div>
      </div>
    </SectionCard>
  )
}
