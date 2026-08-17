// The icon, drawn by the game's own materials rather than in a drawing app:
// the same glass, the same rim, the same three pigments the first sky is made
// of. Rendered by the browser and photographed, so what ships on a home screen
// is the thing the game actually looks like.
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

mkdirSync('public/icons', { recursive: true })

const art = (px) => `<!doctype html><html><body style="margin:0">
<div style="width:${px}px;height:${px}px;position:relative;overflow:hidden;
  background:radial-gradient(ellipse 140% 70% at 50% -10%, #101a2e, transparent 60%),
             radial-gradient(ellipse 110% 50% at 50% 105%, rgba(255,150,40,0.22), transparent 70%),
             linear-gradient(#05070e, #04050a)">
  ${[
    // the core, and the three pigments coming home to it
    { x: 0.5, y: 0.53, r: 0.2, c: '255,150,52' },
    { x: 0.29, y: 0.31, r: 0.115, c: '255,58,48' },
    { x: 0.71, y: 0.31, r: 0.115, c: '255,214,40' },
    { x: 0.5, y: 0.83, r: 0.105, c: '58,140,224' },
  ]
    .map(
      (d) => `<div style="position:absolute;
      left:${(d.x - d.r) * px}px;top:${(d.y - d.r) * px}px;
      width:${d.r * 2 * px}px;height:${d.r * 2 * px}px;border-radius:50%;
      background:linear-gradient(rgba(${d.c},0.62),rgba(${d.c},0.36) 48%,rgba(${d.c},0.54)),
                 linear-gradient(rgba(255,255,255,0.16),rgba(255,255,255,0.05));
      box-shadow: inset 0 ${px * 0.004}px 0 rgba(255,255,255,0.5),
                  inset 0 0 0 ${px * 0.008}px rgba(${d.c},0.95),
                  0 0 ${px * 0.06}px rgba(${d.c},0.4)"></div>`,
    )
    .join('')}
</div></body></html>`

const browser = await chromium.launch()
for (const px of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: px, height: px } })
  await page.setContent(art(px))
  await page.waitForTimeout(120)
  await page.screenshot({ path: `public/icons/icon-${px}.png` })
  await page.close()
}
await browser.close()

// …and a tab-sized one that needs no photograph
writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#05070e"/>
  <circle cx="32" cy="34" r="13" fill="rgba(255,150,52,0.55)" stroke="rgb(255,150,52)" stroke-width="1.6"/>
  <circle cx="18.5" cy="20" r="7.4" fill="rgba(255,58,48,0.55)" stroke="rgb(255,58,48)" stroke-width="1.4"/>
  <circle cx="45.5" cy="20" r="7.4" fill="rgba(255,214,40,0.5)" stroke="rgb(255,214,40)" stroke-width="1.4"/>
  <circle cx="32" cy="53" r="6.7" fill="rgba(58,140,224,0.55)" stroke="rgb(58,140,224)" stroke-width="1.4"/>
</svg>
`,
)
console.log('icons in public/icons/')
