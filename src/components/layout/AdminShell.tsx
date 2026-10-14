import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, ChevronsLeft, Eye, EyeOff, LogOut, Menu, Moon, MonitorSmartphone, Search, Sun, School, UserRound, Wifi, WifiOff,
} from 'lucide-react'
import { ADMIN_NAV } from './nav'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useUi, applyTheme } from '@/store/ui'
import { cn } from '@/lib/utils'
import { Button, Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, Sheet, Badge } from '@/components/ui'
import { GlobalSearch } from '@/components/common/GlobalSearch'

function Brand({ collapsed }: { collapsed?: boolean }) {
  const { settings } = useSettings()
  return (
    <div className="flex items-center gap-2.5 overflow-hidden">
      {settings.logo_url ? (
        <img src={settings.logo_url} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white">
          <School className="size-5" />
        </span>
      )}
      {!collapsed && (
        <div className="min-w-0">
          <p className="truncate text-[14px] font-extrabold leading-tight text-ink">{settings.app_name}</p>
          <p className="truncate text-[11px] text-muted">{settings.teacher_name || settings.tagline}</p>
        </div>
      )}
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useUi()
  useEffect(() => {
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => theme === 'system' && applyTheme('system')
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [theme])

  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : MonitorSmartphone
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="المظهر">
          <Icon className="size-[18px]" />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => setTheme('light')}><Sun className="size-4" /> فاتح</DropdownItem>
        <DropdownItem onSelect={() => setTheme('dark')}><Moon className="size-4" /> داكن</DropdownItem>
        <DropdownItem onSelect={() => setTheme('system')}><MonitorSmartphone className="size-4" /> حسب النظام</DropdownItem>
      </DropdownContent>
    </Dropdown>
  )
}

function OnlineDot() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (online) return null
  return (
    <Badge tone="warning" className="hidden sm:inline-flex">
      <WifiOff className="size-3" /> غير متصل
    </Badge>
  )
}

/** تنبيه بسيط في الشريط العلوي لو مر أسبوع بدون حفظ نسخة احتياطية كملف */
function BackupBell() {
  const { settings } = useSettings()
  const nav = useNavigate()
  const last = settings.last_file_backup_at
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null
  const due = days === null || days >= 7
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => nav('/settings/backup')}
      aria-label="النسخ الاحتياطي"
      title={due ? (days === null ? 'لم تحفظ نسخة احتياطية على جهازك بعد' : `آخر نسخة على الجهاز منذ ${days} يوم`) : 'النسخ الاحتياطي محدث'}
      className="relative"
    >
      <Bell className="size-[18px]" />
      {due && <span className="absolute top-2 left-2 size-2 rounded-full bg-danger ring-2 ring-[var(--surface)]" />}
    </Button>
  )
}

export function AdminShell() {
  const { signOut } = useAuth()
  const { settings } = useSettings()
  const { sidebarCollapsed, toggleSidebar, hideBalances, toggleBalances } = useUi()
  const [mobileNav, setMobileNav] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()

  useEffect(() => setMobileNav(false), [loc.pathname])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const primary = ADMIN_NAV.filter((n) => n.primary)

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* ============ الشريط الجانبي — سطح المكتب ============ */}
      <aside
        className={cn(
          'no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-l border-line bg-surface transition-all lg:flex',
          sidebarCollapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div className="flex h-16 items-center justify-between px-3.5">
          <Brand collapsed={sidebarCollapsed} />
          <Button variant="ghost" size="iconSm" onClick={toggleSidebar} aria-label="طي القائمة">
            <ChevronsLeft className={cn('size-4 transition-transform', sidebarCollapsed && 'rotate-180')} />
          </Button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'tap flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition',
                  isActive
                    ? 'bg-[color-mix(in_oklab,var(--brand)_13%,transparent)] text-[var(--brand)]'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                  sidebarCollapsed && 'justify-center px-0',
                )
              }
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon className="size-[19px] shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <Button variant="ghost" block className="justify-start gap-3 text-ink-2" onClick={() => signOut()}>
            <LogOut className="size-[18px]" />
            {!sidebarCollapsed && 'تسجيل الخروج'}
          </Button>
        </div>
      </aside>

      {/* ============ المحتوى ============ */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-header no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line glass px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="القائمة">
            <Menu className="size-5" />
          </Button>
          <div className="lg:hidden"><Brand collapsed /></div>

          <button
            onClick={() => setSearchOpen(true)}
            className="tap mr-1 hidden h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-[13px] text-muted transition hover:border-line-strong md:flex md:max-w-sm"
          >
            <Search className="size-4" />
            بحث سريع عن طالب…
            <kbd className="mr-auto rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted">Ctrl K</kbd>
          </button>

          <div className="mr-auto flex items-center gap-1">
            <OnlineDot />
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(true)} aria-label="بحث">
              <Search className="size-[18px]" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleBalances}
              aria-label={hideBalances ? 'إظهار الأرصدة' : 'إخفاء الأرصدة'}
              title={hideBalances ? 'إظهار الأرصدة' : 'إخفاء الأرصدة'}
            >
              {hideBalances ? <EyeOff className="size-[18px] text-warning" /> : <Eye className="size-[18px]" />}
            </Button>
            <ThemeToggle />
            <BackupBell />
            <Dropdown>
              <DropdownTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="الحساب">
                  {settings.avatar_url ? (
                    <img src={settings.avatar_url} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <UserRound className="size-[18px]" />
                  )}
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                <div className="px-2.5 py-2">
                  <p className="text-[13px] font-bold text-ink">{settings.teacher_name || 'المدرّس'}</p>
                  <p className="text-[11px] text-muted">صلاحيات كاملة</p>
                  <p className="mt-1 text-[10.5px] text-muted">إصدار التطبيق: {__APP_BUILD__}</p>
                </div>
                <DropdownSeparator />
                <DropdownItem onSelect={() => nav('/settings')}>الإعدادات</DropdownItem>
                <DropdownItem onSelect={() => nav('/settings/backup')}>النسخ الاحتياطي</DropdownItem>
                <DropdownSeparator />
                <DropdownItem danger onSelect={() => signOut()}>
                  <LogOut className="size-4" /> تسجيل الخروج
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-8">
          <Outlet />
        </main>

        {/* ============ التنقل السفلي — الموبايل ============ */}
        <nav className="bottom-nav no-print safe-b fixed inset-x-0 bottom-0 z-30 flex border-t border-line glass lg:hidden">
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'tap flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold transition',
                  isActive ? 'text-[var(--brand)]' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('rounded-lg px-3 py-1 transition', isActive && 'bg-[color-mix(in_oklab,var(--brand)_14%,transparent)]')}>
                    <item.icon className="size-[19px]" />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
          <button onClick={() => setMobileNav(true)} className="tap flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold text-muted">
            <span className="px-3 py-1"><Menu className="size-[19px]" /></span>
            المزيد
          </button>
        </nav>
      </div>

      {/* ============ قائمة الموبايل ============ */}
      <Sheet open={mobileNav} onOpenChange={setMobileNav} title={<Brand />}>
        <nav className="space-y-0.5 p-2.5">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'tap flex items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold transition',
                  isActive ? 'bg-[color-mix(in_oklab,var(--brand)_13%,transparent)] text-[var(--brand)]' : 'text-ink-2',
                )
              }
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => signOut()}
            className="tap mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[14px] font-semibold text-danger"
          >
            <LogOut className="size-5" /> تسجيل الخروج
          </button>
        </nav>
      </Sheet>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
