// توليد أيقونات التطبيق بأحجام PWA من ملف SVG واحد
import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(process.cwd(), 'public/icons')
await mkdir(root, { recursive: true })
const svg = await readFile(path.join(root, 'icon.svg'))

const sizes = [64, 128, 144, 152, 180, 192, 256, 384, 512]
for (const s of sizes) {
  await sharp(svg).resize(s, s).png({ compressionLevel: 9 }).toFile(path.join(root, `icon-${s}.png`))
}

// نسخة maskable بهامش أمان 10%
for (const s of [192, 512]) {
  const inner = Math.round(s * 0.78)
  const pad = Math.round((s - inner) / 2)
  const base = await sharp(svg).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: s, height: s, channels: 4, background: '#1d4ed8' } })
    .composite([{ input: base, top: pad, left: pad }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, `maskable-${s}.png`))
}

// شاشة بداية بسيطة لأجهزة iOS
await sharp({ create: { width: 1170, height: 2532, channels: 4, background: '#0b1220' } })
  .composite([{ input: await sharp(svg).resize(360, 360).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(path.join(root, 'splash.png'))

await writeFile(path.join(root, 'README.txt'), 'أيقونات مولّدة تلقائيًا — شغّل: npm run icons\n')
console.log('✓ تم توليد الأيقونات')
