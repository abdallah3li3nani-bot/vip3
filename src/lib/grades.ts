/**
 * التعرّف على الصف الدراسي من أي صيغة مكتوبة:
 * "الصف الأول" / "اولى" / "1" / "١" / "one" / "first" / "1st" / "Grade 1"
 * "الثاني" / "تانية" / "2" / "two" / "tow" / "second"
 * "الثالث" / "تالتة" / "3" / "three" / "third"
 */
export type GradeLevel = 1 | 2 | 3

export const GRADE_LABEL: Record<GradeLevel, string> = {
  1: 'الصف الأول',
  2: 'الصف الثاني',
  3: 'الصف الثالث',
}

/** توحيد الحروف العربية والأرقام لتسهيل المطابقة */
export function normalizeGradeText(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // التشكيل والتطويل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[_\-.,/\\()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// كلمات لا تدل على رقم الصف ويجب حذفها قبل المطابقة (خصوصاً "ثانوي" التي تشبه "ثاني")
const NOISE = /(ثانوي[ه]?|الثانوي[ه]?|صناعي[ه]?|الصناعي[ه]?|فني[ه]?|الفني[ه]?|secondary|industrial|الصف|صف|الفرقه|فرقه|السنه|سنه|grade|class|year|level|g\b)/g

const LEVEL_WORDS: [GradeLevel, RegExp][] = [
  [3, /(^|\s)(ال)?(ثالث|ثالثه|تالت|تالته|تالتة|third|three|thre|thr|3rd|3)(\s|$)/],
  [2, /(^|\s)(ال)?(ثاني|ثانيه|تاني|تانيه|ثان|second|two|tow|tw|2nd|2)(\s|$)/],
  [1, /(^|\s)(ال)?(اول|اولي|اوله|first|one|frist|1st|1)(\s|$)/],
]

/** يرجّع 1 أو 2 أو 3، أو null لو النص مش واضح */
export function parseGradeLevel(v: unknown): GradeLevel | null {
  if (typeof v === 'number' && [1, 2, 3].includes(v)) return v as GradeLevel
  let t = normalizeGradeText(v)
  if (!t) return null
  // فصل الأرقام الملتصقة بحروف مثل "g1" أو "1ث"
  t = t.replace(/(\d)/g, ' $1 ').replace(/\s+/g, ' ').trim()
  t = t.replace(NOISE, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  for (const [level, re] of LEVEL_WORDS) if (re.test(t)) return level
  return null
}

/** مستوى الصف من بيانات سنة دراسية مسجّلة في التطبيق (من الاسم أو المعرّف) */
export function yearLevel(year: { id: string; name: string; sort_order?: number }): GradeLevel | null {
  const fromId = /year_grade_(\d)/.exec(year.id)
  if (fromId && ['1', '2', '3'].includes(fromId[1])) return Number(fromId[1]) as GradeLevel
  return parseGradeLevel(year.name)
}
