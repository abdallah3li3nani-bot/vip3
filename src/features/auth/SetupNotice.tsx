import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Card, Button } from '@/components/ui'

export default function SetupNotice() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-5">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-warning-bg text-warning">
            <AlertTriangle className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-ink">التطبيق غير مربوط بقاعدة البيانات</h1>
            <p className="text-[13px] text-ink-2">خطوة واحدة متبقية قبل التشغيل</p>
          </div>
        </div>
        <ol className="space-y-2.5 text-[13.5px] leading-relaxed text-ink-2">
          <li>1. أنشئ مشروعًا مجانيًا على Supabase.</li>
          <li>2. من <span className="font-semibold text-ink">Project Settings → API</span> انسخ الـ URL و anon key.</li>
          <li>
            3. أنشئ ملف <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px]">.env</code> بجوار المشروع وضع فيه:
            <pre className="num mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-[12px] leading-6" dir="ltr">{`VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...`}</pre>
          </li>
          <li>4. شغّل ملفات SQL الموجودة في مجلد <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px]">supabase/</code> بالترتيب من SQL Editor.</li>
          <li>5. أعد تشغيل التطبيق.</li>
        </ol>
        <Button asChild className="mt-5" block>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
            فتح لوحة Supabase <ExternalLink className="size-4" />
          </a>
        </Button>
      </Card>
    </div>
  )
}
