import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** بحث عربي متسامح: يتجاهل التشكيل ويوحّد الألف والهاء والياء */
export function normalizeAr(s: string) {
  return (s || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function matches(haystack: string | null | undefined, needle: string) {
  if (!needle) return true
  return normalizeAr(String(haystack ?? '')).includes(normalizeAr(needle))
}

export function debounce<T extends (...a: never[]) => void>(fn: T, ms = 250) {
  let t: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export function uid() {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string
}

export function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0] ?? '').join('')
}

/** لون ثابت مشتق من نص — لصور الحروف الأولى */
export function colorFromString(s: string) {
  const palette = ['#2563eb', '#0d9488', '#7c3aed', '#c2410c', '#0369a1', '#b91c1c', '#4d7c0f', '#a21caf']
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export function downloadBlob(content: BlobPart, filename: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** تصدير CSV متوافق مع Excel العربي (BOM + فاصلة منقوطة) */
export function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\r\n')
  downloadBlob('﻿' + csv, filename.endsWith('.csv') ? filename : `${filename}.csv`, 'text/csv;charset=utf-8')
}

export function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K) {
  return arr.reduce<Record<K, T[]>>((acc, item) => {
    const k = key(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {} as Record<K, T[]>)
}

export function sum<T>(arr: T[], pick: (t: T) => number) {
  return arr.reduce((a, b) => a + (pick(b) || 0), 0)
}

export function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
  return Promise.resolve()
}
