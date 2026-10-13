import * as XLSX from 'xlsx'

export interface ParsedStudentRow {
  full_name: string
  specialization?: string
}

/**
 * تحليل ملف إكسيل أو CSV واستخراج بيانات الطلاب (اسم الطالب + التخصص)
 */
export async function parseStudentsExcel(file: File): Promise<ParsedStudentRow[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) throw new Error('الملف فارغ ولا يحتوي على أوراق عمل')

  const worksheet = workbook.Sheets[firstSheetName]
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

  if (rawRows.length === 0) throw new Error('ورقة العمل لا تحتوي على بيانات')

  // العثور على رأس الجدول (Header row)
  let headerIndex = -1
  let nameCol = -1
  let specCol = -1

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i]
    if (!row || !Array.isArray(row)) continue

    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim().toLowerCase()
      if (val.includes('اسم') || val.includes('طالب') || val.includes('name')) {
        nameCol = c
        headerIndex = i
      }
      if (val.includes('تخصص') || val.includes('قسم') || val.includes('شعبة') || val.includes('special')) {
        specCol = c
      }
    }

    if (nameCol !== -1) break
  }

  // إذا لم نجد رأس صريح، نعتبر العمود الأول اسم والعمود الثاني تخصص
  const startIndex = headerIndex !== -1 ? headerIndex + 1 : 0
  if (nameCol === -1) nameCol = 0
  if (specCol === -1 && rawRows[0]?.length > 1) specCol = 1

  const results: ParsedStudentRow[] = []

  for (let r = startIndex; r < rawRows.length; r++) {
    const row = rawRows[r]
    if (!row || !Array.isArray(row)) continue

    const nameVal = String(row[nameCol] || '').trim()
    if (!nameVal || nameVal === 'undefined' || nameVal.length < 2) continue

    const specVal = specCol !== -1 && row[specCol] ? String(row[specCol]).trim() : 'عام'

    results.push({
      full_name: nameVal,
      specialization: specVal || 'عام',
    })
  }

  return results
}

/**
 * تنزيل نموذج شيت إكسيل جاهز لتعبئة بيانات الطلاب
 */
export function downloadExcelTemplate() {
  const wsData = [
    ['اسم الطالب', 'التخصص'],
    ['أحمد محمد علي', 'علمي'],
    ['محمود حسن إبراهيم', 'أدبي'],
    ['سارة خالد عبد الرحمن', 'عام'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'الطلاب')
  XLSX.writeFile(wb, 'نموذج_كشف_الطلاب.xlsx')
}
