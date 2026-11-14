/**
 * Ritar ut alla ikoner på ett ark för granskning (bara när GLYPH_SHEET_OUT är satt):
 *   GLYPH_SHEET_OUT=/sökväg/ark.html GLYPH_GROUP=mat npx vitest run src/components/icons/sheet.test.tsx
 * Varje ruta visar ikonen i två storlekar (24 och 44 px) i gran-grönt på en mjuk bakgrund, med teckenkoden under.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it } from 'vitest'
import { Glyph } from './Glyph'
import { AKTIVITET } from './glyphs/aktivitet'
import { KALENDER } from './glyphs/kalender'
import { MAT } from './glyphs/mat'
import { OVRIGT } from './glyphs/ovrigt'

const GROUPS = { mat: MAT, aktivitet: AKTIVITET, kalender: KALENDER, ovrigt: OVRIGT } as const
const nodeModule = <T,>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>
/** Miljövariabler utan Node-typer (testerna kör i Node). */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const out = env.GLYPH_SHEET_OUT
const group = (env.GLYPH_GROUP ?? 'mat') as keyof typeof GROUPS

describe.skipIf(!out)('ikonark', () => {
  it('skriver arket', async () => {
    const cells = Object.keys(GROUPS[group]).map(
      (e) =>
        `<div class="c"><div class="i s"><span style="font-size:24px">${renderToStaticMarkup(<Glyph emoji={e} />)}</span></div>` +
        `<div class="i b"><span style="font-size:44px">${renderToStaticMarkup(<Glyph emoji={e} />)}</span></div>` +
        `<small>${[...e].map((ch) => ch.codePointAt(0)!.toString(16)).join(' ')}</small></div>`,
    )
    const html = `<!doctype html><meta charset=utf-8><style>
      body{margin:16px;font:12px system-ui;background:#f6f3ec;color:#1f5a43}
      .g{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}
      .c{background:#dcebe2;border-radius:14px;padding:10px;text-align:center}
      .i{display:grid;place-items:center;height:56px}.s{height:36px}
      small{color:#48524d;font-size:10px}
      svg{display:inline-block;width:1.15em;height:1.15em;vertical-align:-0.2em}
    </style><h3>${group}: ${cells.length} ikoner</h3><div class="g">${cells.join('')}</div>`
    const { writeFileSync } = await nodeModule<{ writeFileSync: (path: string, data: string) => void }>('node:fs')
    writeFileSync(out!, html)
  })
})
