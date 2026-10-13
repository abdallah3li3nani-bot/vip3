import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null; info: string | null }

/**
 * يمنع الشاشة البيضاء: أي انهيار في الواجهة يظهر كرسالة مفهومة
 * مع تفاصيل الخطأ حتى يمكن تشخيصه، بدل اختفاء التطبيق بالكامل.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack?.slice(0, 900) ?? null })
    console.error('[منصّة المعلّم] انهيار في الواجهة:', error, info)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div dir="rtl" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b1220', color: '#e8edf6', fontFamily: 'Cairo, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 620, width: '100%' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>حصل خطأ غير متوقع في التطبيق</h1>
          <p style={{ fontSize: 14, color: '#a7b3c7', lineHeight: 1.7, marginTop: 8 }}>
            التطبيق توقف عن العمل. البيانات كلها محفوظة وما حصلهاش حاجة. جرّب إعادة التحميل،
            ولو تكرر الخطأ ابعت النص اللي تحت للمطوّر.
          </p>

          <pre style={{ direction: 'ltr', textAlign: 'left', marginTop: 14, padding: 12, borderRadius: 10, background: '#121a2a', border: '1px solid #24304a', fontSize: 12, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
{String(error?.message || error)}
{info ? `\n${info}` : ''}
          </pre>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => location.reload()}
              style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              إعادة تحميل التطبيق
            </button>
            <button
              onClick={async () => {
                try {
                  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
                  for (const n of await caches.keys()) await caches.delete(n)
                  localStorage.clear()
                } catch { /* تجاهل */ }
                location.replace('/')
              }}
              style={{ background: 'transparent', color: '#a7b3c7', border: '1px solid #33415f', borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              مسح البيانات المؤقتة والبدء من جديد
            </button>
          </div>
        </div>
      </div>
    )
  }
}
