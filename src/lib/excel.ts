import * as XLSX from 'xlsx'
import { normalizeGradeText, parseGradeLevel, type GradeLevel } from './grades'

export interface ParsedStudentRow {
  full_name: string
  specialization?: string
  /** الصف كما تم التعرف عليه (1/2/3) أو null لو غير واضح */
  grade_level?: GradeLevel | null
  /** النص الأصلي المكتوب في خانة الصف */
  grade_raw?: string
}

export interface ParsedSheetResult {
  rows: ParsedStudentRow[]
  /** من أين عرفنا الصف: عمود في الشيت، أو اسم الورقة، أو لا شيء */
  gradeSource: 'column' | 'sheet' | 'mixed' | 'none'
}

type Col = 'name' | 'grade' | 'spec' | null

/** تصنيف خانة رأس الجدول */
function classifyHeader(cell: unknown): Col {
  const v = normalizeGradeText(cell)
  if (!v) return null
  if (/(^|\s)(ال)?(صف|فرقه|سنه الدراسيه|المرحله)|grade|class|level|stage|year/.test(v)) return 'grade'
  if (/تخصص|قسم|شعبه|special|department|major|branch/.test(v)) return 'spec'
  if (/اسم|name|الطالب|طالب|student/.test(v)) return 'name'
  return null
}

function parseSheet(ws: XLSX.WorkSheet, sheetLevel: GradeLevel | null) {
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const rows = raw.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
  if (rows.length === 0) return { rows: [] as ParsedStudentRow[], usedColumn: false, usedSheet: false }

  // 1) البحث عن صف العناوين في أول 10 صفوف
  let headerIndex = -1
  let nameCol = -1
  let gradeCol = -1
  let specCol = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    let n = -1, g = -1, s = -1
    rows[i].forEach((cell, c) => {
      const t = classifyHeader(cell)
      if (t === 'name' && n === -1) n = c
      else if (t === 'grade' && g === -1) g = c
      else if (t === 'spec' && s === -1) s = c
    })
    if (n !== -1) {
      headerIndex = i
      nameCol = n
      gradeCol = g
      specCol = s
      break
    }
  }

  const body = rows.slice(headerIndex + 1)
  const width = Math.max(...body.map((r) => r.length), 0)

  // 2) بدون عناوين: عمود الاسم = العمود اللي أغلب قيمه أسماء من أكتر من كلمة
  if (nameCol === -1) {
    let best = 0
    let bestScore = -1
    for (let c = 0; c < width; c++) {
      const score = body.reduce<number>((a, r) => {
        const v = String(r[c] ?? '').trim()
        return a + (v.length >= 5 && /[؀-ۿa-zA-Z]/.test(v) && v.includes(' ') ? 1 : 0)
      }, 0)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    nameCol = best
  }

  // 3) لو مفيش عنوان للصف: نكتشف العمود اللي أغلب قيمه صفوف دراسية
  if (gradeCol === -1) {
    for (let c = 0; c < width; c++) {
      if (c === nameCol || c === specCol) continue
      const vals = body.map((r) => String(r[c] ?? '').trim()).filter(Boolean)
      if (vals.length === 0) continue
      const hits = vals.filter((v) => parseGradeLevel(v) !== null).length
      if (hits / vals.length >= 0.6) {
        gradeCol = c
        break
      }
    }
  }

  // 4) التخصص بدون عنوان: أول عمود نصي قصير متبقي
  if (specCol === -1 && headerIndex === -1) {
    for (let c = 0; c < width; c++) {
      if (c === nameCol || c === gradeCol) continue
      const vals = body.map((r) => String(r[c] ?? '').trim()).filter(Boolean)
      if (vals.length && vals.every((v) => v.length <= 25 && !/^\d+$/.test(v))) {
        specCol = c
        break
      }
    }
  }

  const out: ParsedStudentRow[] = []
  let usedColumn = false
  let usedSheet = false
  for (const r of body) {
    const name = String(r[nameCol] ?? '').replace(/\s+/g, ' ').trim()
    if (!name || name.length < 2 || /^\d+$/.test(name)) continue
    const gradeRaw = gradeCol !== -1 ? String(r[gradeCol] ?? '').trim() : ''
    let level = gradeRaw ? parseGradeLevel(gradeRaw) : null
    if (level) usedColumn = true
    if (!level && sheetLevel) {
      level = sheetLevel
      usedSheet = true
    }
    const spec = specCol !== -1 ? String(r[specCol] ?? '').trim() : ''
    out.push({
      full_name: name,
      specialization: spec || 'عام',
      grade_level: level,
      grade_raw: gradeRaw || undefined,
    })
  }
  return { rows: out, usedColumn, usedSheet }
}

/**
 * قراءة ملف إكسيل/CSV: اسم الطالب + الصف الدراسي + التخصص.
 * يقرأ كل الأوراق، ولو اسم الورقة نفسه صف (مثلاً "الصف الثالث") يُستخدم للطلاب اللي مكتوبش صفهم.
 */
export async function parseStudentsExcel(file: File): Promise<ParsedSheetResult> {
  const buffer = await file.arrayBuffer()
  return parseStudentsWorkbook(XLSX.read(buffer, { type: 'array' }))
}

/** صف من اسم الورقة، مع تجاهل الأسماء الافتراضية زي Sheet1 / ورقة1 */
function sheetNameLevel(name: string): GradeLevel | null {
  const t = normalizeGradeText(name)
  if (/^(sheet|ورقه|page|tabelle|feuil)\s*\d*$/.test(t)) return null
  return parseGradeLevel(t)
}

export function parseStudentsWorkbook(workbook: XLSX.WorkBook): ParsedSheetResult {
  if (workbook.SheetNames.length === 0) throw new Error('الملف فارغ ولا يحتوي على أوراق عمل')
  const all: ParsedStudentRow[] = []
  let col = false
  let sheet = false
  for (const name of workbook.SheetNames) {
    const res = parseSheet(workbook.Sheets[name], sheetNameLevel(name))
    all.push(...res.rows)
    col ||= res.usedColumn
    sheet ||= res.usedSheet
  }
  if (all.length === 0) throw new Error('لم يتم العثور على أسماء طلاب في الملف')
  return { rows: all, gradeSource: col && sheet ? 'mixed' : col ? 'column' : sheet ? 'sheet' : 'none' }
}

/** تنزيل نموذج شيت إكسيل جاهز لتعبئة بيانات الطلاب */
export function downloadExcelTemplate() {
  const wsData = [
    ['اسم الطالب', 'الصف الدراسي', 'التخصص'],
    ['أحمد محمد علي', 'الأول', 'كهرباء'],
    ['محمود حسن إبراهيم', 'two', 'ميكانيكا'],
    ['سارة خالد عبد الرحمن', '3', 'زخرفة'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الطلاب')
  XLSX.writeFile(wb, 'نموذج_كشف_الطلاب.xlsx')
}
