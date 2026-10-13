/**
 * محرك قاعدة البيانات المحلي (Offline IndexedDB Engine)
 * يعمل أوفلاين 100% بدون أي سيرفر أو اتصال بالإنترنت.
 * يدعم التخزين الدائم والنسخ الاحتياطي التلقائي اليومي مع الاحتفاظ بآخر 5 نسخ فقط.
 */

export interface DbSettings {
  id: string
  app_name: string
  teacher_name: string
  password_hash: string
  require_auth: boolean
  currency: string
  currency_symbol: string
  pricing_bundles: Record<string, Record<number, number>> // year_id -> { count: price }
  updated_at: string
}

export interface DbYear {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface DbGroup {
  id: string
  year_id: string
  name: string
  notes: string | null
  created_at: string
}

export interface DbSubject {
  id: string
  year_id: string
  name: string
  price: number
  sessions_per_cycle: number
  color: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface DbStudent {
  id: string
  full_name: string
  year_id: string | null
  group_id: string | null
  specialization: string // التخصص (عام، علمي، أدبي، تجاري...)
  is_enrolled: boolean // مشترك بالدروس الخاصة أم طالب مدرسة فقط
  status: 'active' | 'inactive'
  enrolled_at: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DbStudentSubject {
  id: string
  student_id: string
  subject_id: string
  price_override: number | null
  is_active: boolean
  started_at: string
  created_at: string
}

export interface DbSession {
  id: string
  subject_id: string
  group_id: string | null
  session_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  status: 'scheduled' | 'done' | 'postponed' | 'cancelled'
  rescheduled_to?: string | null
  reason?: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DbAttendance {
  id: string
  session_id: string
  student_id: string
  status: 'present' | 'absent' | 'late' | 'excused'
  note: string | null
  recorded_at: string
}

export interface DbCycle {
  id: string
  student_id: string
  subject_id: string
  cycle_index: number
  sessions_target: number
  sessions_done: number
  status: 'open' | 'completed'
  opened_at: string
  completed_at: string | null
}

export interface DbCharge {
  id: string
  student_id: string
  kind: 'cycle' | 'extra'
  title: string
  amount: number
  paid_amount: number
  subject_id: string | null
  cycle_id: string | null
  due_date: string
  status: 'unpaid' | 'partial' | 'paid' | 'void'
  notes: string | null
  created_at: string
  void_at: string | null
}

export interface DbPayment {
  id: string
  student_id: string
  amount: number
  method: 'cash' | 'bank' | 'wallet' | 'instapay' | 'other'
  paid_at: string
  reference: string | null
  notes: string | null
  created_at: string
}

export interface DbBooklet {
  id: string
  year_id: string
  title: string
  price: number
  term: string // الترم الأول / الترم الثاني / مراجعة
  notes: string | null
  created_at: string
}

export interface DbBookletOrder {
  id: string
  booklet_id: string
  student_id: string
  price: number
  paid_amount: number
  remaining_amount: number
  payment_method: 'cash' | 'wallet' | 'instapay'
  is_delivered: boolean
  delivered_at: string | null
  notes: string | null
  created_at: string
}

export interface DbBackupSnapshot {
  id: string
  date: string // YYYY-MM-DD
  timestamp: number
  label: string
  students_count: number
  orders_count: number
  dump_json: string
}

const DB_NAME = 'moallem_offline_v1'
const DB_VERSION = 1

const STORES = [
  'settings',
  'years',
  'groups',
  'subjects',
  'students',
  'student_subjects',
  'sessions',
  'attendance',
  'cycles',
  'charges',
  'payments',
  'booklets',
  'booklet_orders',
  'backups',
] as const

export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' })
        }
      }
    }

    request.onsuccess = async () => {
      const db = request.result
      await seedDefaultsIfEmpty(db)
      resolve(db)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })

  return dbPromise
}

/** توليد معرّف عشوائي فريد آمن */
export function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
}

/** استعلام عام لجلب كل السجلات من جدول */
export async function dbGetAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.getAll()
    req.onsuccess = () => resolve((req.result as T[]) || [])
    req.onerror = () => reject(req.error)
  })
}

/** جلب سجل بواسطة معرّفه */
export async function dbGetById<T>(storeName: StoreName, id: string): Promise<T | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(id)
    req.onsuccess = () => resolve((req.result as T) || null)
    req.onerror = () => reject(req.error)
  })
}

/** إضافة أو تعديل سجل */
export async function dbPut<T extends { id: string }>(storeName: StoreName, item: T): Promise<T> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.put(item)
    req.onsuccess = () => resolve(item)
    req.onerror = () => reject(req.error)
  })
}

/** حذف سجل */
export async function dbDelete(storeName: StoreName, id: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** مسح كل سجلات جدول */
export async function dbClear(storeName: StoreName): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/** حفظ بيانات افتراضية أولية عند فتح التطبيق لأول مرة */
async function seedDefaultsIfEmpty(db: IDBDatabase) {
  const tx = db.transaction(['settings', 'years', 'subjects'], 'readonly')
  const settingsStore = tx.objectStore('settings')
  const req = settingsStore.get('app_settings')

  req.onsuccess = async () => {
    if (!req.result) {
      const year1Id = 'year_grade_1'
      const year2Id = 'year_grade_2'
      const now = new Date().toISOString()

      const writeTx = db.transaction(['settings', 'years', 'subjects'], 'readwrite')

      // الإعدادات الافتراضية
      writeTx.objectStore('settings').put({
        id: 'app_settings',
        app_name: 'منصّة المعلّم',
        teacher_name: 'الأستاذ',
        password_hash: '1234', // كلمة المرور الافتراضية
        require_auth: true,
        currency: 'EGP',
        currency_symbol: 'ج.م',
        pricing_bundles: {
          [year1Id]: { 1: 150, 2: 250 }, // الصف الأول: مادة 150ج، مادتين 250ج
          [year2Id]: { 1: 150, 2: 280, 3: 390, 4: 480 }, // الصف الثاني: 4 مواد
        },
        updated_at: now,
      } as DbSettings)

      // الصف الأول والثاني
      writeTx.objectStore('years').put({
        id: year1Id,
        name: 'الصف الأول الثانوي',
        sort_order: 1,
        is_active: true,
        created_at: now,
      } as DbYear)

      writeTx.objectStore('years').put({
        id: year2Id,
        name: 'الصف الثاني الثانوي',
        sort_order: 2,
        is_active: true,
        created_at: now,
      } as DbYear)

      // مواد الصف الأول (مادتان)
      writeTx.objectStore('subjects').put({
        id: 'sub_g1_1',
        year_id: year1Id,
        name: 'المادة الأولى',
        price: 150,
        sessions_per_cycle: 8,
        color: '#2563eb',
        is_active: true,
        notes: null,
        created_at: now,
      } as DbSubject)

      writeTx.objectStore('subjects').put({
        id: 'sub_g1_2',
        year_id: year1Id,
        name: 'المادة الثانية',
        price: 150,
        sessions_per_cycle: 8,
        color: '#10b981',
        is_active: true,
        notes: null,
        created_at: now,
      } as DbSubject)

      // مواد الصف الثاني (أربع مواد)
      writeTx.objectStore('subjects').put({
        id: 'sub_g2_1',
        year_id: year2Id,
        name: 'المادة الأولى',
        price: 150,
        sessions_per_cycle: 8,
        color: '#8b5cf6',
        is_active: true,
        notes: null,
        created_at: now,
      } as DbSubject)

      writeTx.objectStore('subjects').put({
        id: 'sub_g2_2',
        year_id: year2Id,
        name: 'المادة الثانية',
        price: 150,
        sessions_per_cycle: 8,
        color: '#f59e0b',
        is_active: true,
        notes: null,
        created_at: now,
      } as DbSubject)

      writeTx.objectStore('subjects').put({
        id: 'sub_g2_3',
        year_id: year2Id,
        name: 'المادة الثالثة',
        price: 150,
        sessions_per_cycle: 8,
        color: '#ec4899',
        is_active: true,
        notes: null,
        created_at: now,
      } as DbSubject)

      writeTx.objectStore('subjects').put({
        id: 'sub_g2_4',
        year_id: year2Id,
        name: 'المادة الرابعة',
        price: 150,
        sessions_per_cycle: 8,
        color: '#06b6d4',
        is_active: true,
        notes: null,
        created_at: now,
      } as DbSubject)
    }
  }
}

/* ========================================================================== */
/*                             الحفظ الدائم والنسخ                            */
/* ========================================================================== */

/** طلب حماية التخزين الدائم من نظام الهاتف والمتصفح */
export async function ensureStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist()
      return isPersisted
    } catch {
      return false
    }
  }
  return false
}

/** التحقق من حالة حماية التخزين الحالية ومساحته */
export async function getStorageStatus(): Promise<{ persisted: boolean; usageMB: number; quotaMB: number }> {
  let persisted = false
  let usageMB = 0
  let quotaMB = 0

  if (typeof navigator !== 'undefined' && navigator.storage) {
    if (navigator.storage.persisted) {
      try {
        persisted = await navigator.storage.persisted()
      } catch {
        persisted = false
      }
    }
    if (navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate()
        usageMB = Math.round(((est.usage || 0) / (1024 * 1024)) * 10) / 10
        quotaMB = Math.round(((est.quota || 0) / (1024 * 1024)) * 10) / 10
      } catch {
        /* تجاهل */
      }
    }
  }

  return { persisted, usageMB, quotaMB }
}

/** تصدير جميع الجداول ككائن JSON كامل للنسخ الاحتياطي */
export async function exportDatabaseDump(): Promise<Record<string, unknown[]>> {
  const dump: Record<string, unknown[]> = {}
  for (const store of STORES) {
    if (store === 'backups') continue // لا نضمّن لقطات النسخ داخل النسخة
    dump[store] = await dbGetAll(store)
  }
  return dump
}

/** استعادة جميع الجداول من كائن JSON */
export async function restoreDatabaseDump(dump: Record<string, unknown[]>): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORES as unknown as string[], 'readwrite')

  for (const store of STORES) {
    if (store === 'backups') continue
    const storeObj = tx.objectStore(store)
    storeObj.clear()
    const items = dump[store] || []
    if (Array.isArray(items)) {
      for (const it of items) {
        storeObj.put(it)
      }
    }
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** أخذ لقطة يومية تلقائية مع الاحتفاظ بآخر 5 نسخ فقط */
export async function triggerDailyRollingBackup(): Promise<DbBackupSnapshot | null> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const existingBackups = await dbGetAll<DbBackupSnapshot>('backups')

  // إذا تم أخذ نسخة اليوم بالفعل، نكتفي بها
  const alreadyTakenToday = existingBackups.some((b) => b.date === today)
  if (alreadyTakenToday) {
    return null
  }

  const dump = await exportDatabaseDump()
  const students = (dump.students || []) as DbStudent[]
  const orders = (dump.booklet_orders || []) as DbBookletOrder[]

  const newSnapshot: DbBackupSnapshot = {
    id: 'backup_' + today,
    date: today,
    timestamp: Date.now(),
    label: `نسخة تلقائية ليوم ${today}`,
    students_count: students.length,
    orders_count: orders.length,
    dump_json: JSON.stringify(dump),
  }

  // حفظ اللقطة الجديدة
  await dbPut('backups', newSnapshot)

  // فرز النسخ بحسب التاريخ تنازلياً، وحذف ما يتجاوز آخر 5 نسخ
  const updated = await dbGetAll<DbBackupSnapshot>('backups')
  updated.sort((a, b) => b.timestamp - a.timestamp)

  if (updated.length > 5) {
    const toDelete = updated.slice(5)
    for (const b of toDelete) {
      await dbDelete('backups', b.id)
    }
  }

  return newSnapshot
}
