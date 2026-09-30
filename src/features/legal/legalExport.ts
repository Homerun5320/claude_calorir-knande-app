/**
 * Skriver de juridiska texterna som fristående HTML-sidor (public/integritet/, public/villkor/) och
 * som Markdown för ägaren (docs/). Används bara av legal.test.tsx, som jämför resultatet med
 * filerna i repot – ändra texten i legalContent.ts och kör `npx vitest run src/features/legal -u`
 * så skrivs filerna om.
 *
 * De fristående sidorna fungerar utan JavaScript (inga skript – CSP:n tillåter bara appens egna) och
 * har ljust och mörkt tema via prefers-color-scheme.
 */
import { formatLegalDate, parseInline, plainText, type LegalSection, type LegalTable, type LegalVariant } from './legalContent'
import type { ISODate } from '../../types'

export interface LegalDocSpec {
  title: string
  version: ISODate
  description: string
  sections: readonly LegalSection[]
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function esc(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Interna länkar på de fristående sidorna (relativt /integritet/ och /villkor/). */
const HTML_INTERNAL: Readonly<Record<string, string>> = {
  'lagom:villkor': '../villkor/',
  'lagom:integritet': '../integritet/',
}

/** Platshållarna markeras så att de syns tills de fyllts i. */
function markPlaceholders(html: string): string {
  return html.replace(/\[(Företagsnamn|Org\.nr|Adress|Telefon|Momsreg\.nr|E-post)\]/g, '<span class="fyll">[$1]</span>')
}

/**
 * `standalone`: sidan visas fristående (Health Connect i Android-appen) – länkar till appens andra
 * sidor blir vanlig text, så att man inte kan gå vidare till webbplatsens villkor med webbpriser.
 */
function inlineText(text: string, standalone = false): string {
  const html = parseInline(text)
    .map((p) => {
      if (!p.href) return esc(p.text)
      const internal = HTML_INTERNAL[p.href]
      if (internal) return standalone ? esc(p.text) : `<a href="${internal}">${esc(p.text)}</a>`
      if (standalone && p.href.startsWith('lagom:')) return esc(p.text)
      return `<a href="${esc(p.href)}" rel="noopener noreferrer">${esc(p.text)}</a>`
    })
    .join('')
  return markPlaceholders(html)
}

const CSS = `
      :root {
        color-scheme: light dark;
        --bg: #f6f3ec;
        --surface: #ffffff;
        --surface-2: #efeae0;
        --line: #e3dccd;
        --ink: #16201c;
        --ink-2: #48524d;
        --ink-3: #5c645f;
        --gran: #1f5a43;
        --fyll: #fbead0;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0b1210;
          --surface: #131c19;
          --surface-2: #1a2522;
          --line: #26332e;
          --ink: #eeebe3;
          --ink-2: #b9beb8;
          --ink-3: #99a29c;
          --gran: #6cc49a;
          --fyll: #3a2b16;
        }
      }
      * { box-sizing: border-box; }
      html { -webkit-text-size-adjust: 100%; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink-2);
        font: 16px/1.6 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      main { max-width: 42rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
      h1, h2, h3 { color: var(--ink); font-family: Fraunces, Georgia, "Times New Roman", serif; line-height: 1.2; letter-spacing: -0.01em; }
      h1 { font-size: 2rem; margin: 0.25rem 0 0.5rem; }
      h2 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { margin: 0.5rem 0 0; }
      a { color: var(--gran); font-weight: 600; text-underline-offset: 2px; }
      a:focus-visible { outline: 2px solid var(--gran); outline-offset: 2px; border-radius: 4px; }
      .eyebrow { margin: 0; color: var(--ink-3); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .meta { color: var(--ink-3); font-size: 0.875rem; }
      .kort { background: var(--surface); border: 1px solid var(--line); border-radius: 1.5rem; padding: 1.25rem; margin-top: 1rem; }
      .omfang { color: var(--ink-3); font-size: 0.8125rem; font-weight: 600; margin: 0 0 0.25rem; }
      nav ol { margin: 0.5rem 0 0; padding-left: 1.25rem; }
      nav li { margin: 0; }
      nav li a { display: inline-flex; align-items: center; min-height: 2.75rem; }
      ul, ol { margin: 0.5rem 0 0; padding-left: 1.25rem; }
      li { margin: 0.375rem 0; }
      .fyll { background: var(--fyll); border-radius: 0.25rem; padding: 0 0.2em; }
      table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.875rem; }
      th, td { text-align: left; vertical-align: top; padding: 0.5rem; border-top: 1px solid var(--line); }
      th { color: var(--ink); background: var(--surface-2); }
      @media (max-width: 40rem) {
        thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
        table, tbody, tr, td { display: block; width: 100%; }
        tr { background: var(--surface-2); border-radius: 1rem; padding: 0.5rem 0.75rem; margin-top: 0.625rem; }
        td { border: 0; padding: 0.25rem 0; }
        td:first-child { color: var(--ink); font-weight: 600; }
        td + td::before { content: attr(data-label) ": "; color: var(--ink-3); font-weight: 600; }
      }
      footer { margin-top: 2rem; color: var(--ink-3); font-size: 0.875rem; }
`

function sectionHtml(s: LegalSection, standalone = false): string {
  const inlineHtml = (text: string) => inlineText(text, standalone)
  const out: string[] = []
  out.push(`      <section class="kort" id="${esc(s.id)}" aria-labelledby="${esc(s.id)}-rubrik">`)
  out.push(`        <h2 id="${esc(s.id)}-rubrik">${esc(s.heading)}</h2>`)
  if (s.webOnly) out.push('        <p class="omfang">Gäller köp på Lagoms webbplats.</p>')
  for (const p of [...s.paragraphs, ...(s.webParagraphs ?? [])]) out.push(`        <p>${inlineHtml(p)}</p>`)
  if (s.steps?.length) {
    out.push('        <ol>')
    for (const t of s.steps) out.push(`          <li>${inlineHtml(t)}</li>`)
    out.push('        </ol>')
  }
  const items = [...(s.items ?? []), ...(s.webItems ?? []), ...(s.keyItems ?? [])]
  if (items.length) {
    out.push('        <ul>')
    for (const t of items) out.push(`          <li>${inlineHtml(t)}</li>`)
    out.push('        </ul>')
  }
  if (s.table) {
    const { columns, rows } = s.table
    out.push('        <table>')
    out.push(`          <thead><tr>${columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>`)
    out.push('          <tbody>')
    for (const row of rows) {
      out.push(`            <tr>${row.map((cell, i) => `<td data-label="${esc(columns[i])}">${inlineHtml(cell)}</td>`).join('')}</tr>`)
    }
    out.push('          </tbody>')
    out.push('        </table>')
  }
  for (const p of s.closing ?? []) out.push(`        <p>${inlineHtml(p)}</p>`)
  out.push('      </section>')
  return out.join('\n')
}

/**
 * En fristående HTML-sida (utan JavaScript) med hela texten. `standalone`: utan länkar till andra
 * sidor och utan ikon (sidan visas inne i Android-appen, se legalDocs.ts).
 */
export function renderLegalHtml(doc: LegalDocSpec, related: ReadonlyArray<{ href: string; label: string }>, opts: { standalone?: boolean } = {}): string {
  const standalone = opts.standalone === true
  const toc = doc.sections.map((s) => `          <li><a href="#${esc(s.id)}">${esc(s.heading)}</a></li>`).join('\n')
  const links = [...related, { href: '../', label: 'Öppna Lagom' }].map((r) => `<a href="${esc(r.href)}">${esc(r.label)}</a>`).join(' · ')
  const icon = standalone ? '' : '\n    <link rel="icon" type="image/svg+xml" href="../favicon.svg" />'
  const footer = standalone ? '' : `\n      <footer>\n        <p>${links}</p>\n      </footer>`
  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(doc.title)} – Lagom</title>
    <meta name="description" content="${esc(doc.description)}" />${icon}
    <style>${CSS}    </style>
  </head>
  <body>
    <!-- Genereras från src/features/legal/legalContent.ts – ändra texten där och kör: npx vitest run src/features/legal -u -->
    <main>
      <header>
        <p class="eyebrow">Lagom</p>
        <h1>${esc(doc.title)}</h1>
        <p class="meta">Version ${esc(doc.version)} · gäller från ${esc(formatLegalDate(doc.version))}</p>
      </header>
      <nav class="kort" aria-label="Innehåll">
        <h2>Innehåll</h2>
        <ol>
${toc}
        </ol>
      </nav>
${doc.sections.map((s) => sectionHtml(s, standalone)).join('\n')}${footer}
    </main>
  </body>
</html>
`
}

/** Sidans text så som den läses (utan taggar och med avkodade tecken) – för att jämföra i test. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Inline-taggar (länkar, markerade platshållare) försvinner utan mellanrum, övriga blir mellanrum.
    .replace(/<\/?(a|span)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const MD_INTERNAL: Readonly<Record<string, string>> = {
  'lagom:villkor': 'KOPVILLKOR.md',
  'lagom:integritet': 'INTEGRITETSPOLICY.md',
}

function inlineMd(text: string): string {
  return parseInline(text)
    .map((p) => (p.href ? `[${p.text}](${MD_INTERNAL[p.href] ?? p.href})` : p.text))
    .join('')
}

function cellMd(text: string): string {
  return inlineMd(text).replaceAll('|', '\\|')
}

function sectionMd(s: LegalSection): string {
  const out: string[] = [`## ${s.heading}`, '']
  if (s.webOnly) out.push('_Gäller köp på Lagoms webbplats – visas inte i butiksapparna._', '')
  for (const p of s.paragraphs) out.push(inlineMd(p), '')
  for (const p of s.webParagraphs ?? []) out.push(inlineMd(p), '')
  if (s.steps?.length) {
    s.steps.forEach((t, i) => out.push(`${i + 1}. ${inlineMd(t)}`))
    out.push('')
  }
  for (const t of s.items ?? []) out.push(`- ${inlineMd(t)}`)
  for (const t of s.webItems ?? []) out.push(`- ${inlineMd(t)} _(bara webben)_`)
  for (const t of s.keyItems ?? []) out.push(`- ${inlineMd(t)} _(inte i iPhone-appen)_`)
  if (s.items?.length || s.webItems?.length || s.keyItems?.length) out.push('')
  if (s.table) out.push(...tableMd(s.table), '')
  for (const p of s.closing ?? []) out.push(inlineMd(p), '')
  if (s.appStore) out.push(...variantMd('I iPhone-appen (App Store) står i stället:', s.appStore), '')
  if (s.play) out.push(...variantMd('I Google Play-appen står i stället:', s.play), '')
  if (s.ownerNote) out.push(`> **Till ägaren:** ${s.ownerNote}`, '')
  return out.join('\n')
}

function tableMd(table: LegalTable): string[] {
  return [
    `| ${table.columns.map(cellMd).join(' | ')} |`,
    `| ${table.columns.map(() => '---').join(' | ')} |`,
    ...table.rows.map((row) => `| ${row.map(cellMd).join(' | ')} |`),
  ]
}

/** En apps egen text (iPhone-appen eller Google Play-appen), som ett citat under avsnittet (bara i docs/). */
function variantMd(label: string, v: LegalVariant): string[] {
  const lines: string[] = [`**${label}**`, '']
  if (v.heading) lines.push(`Rubrik: ${inlineMd(v.heading)}`, '')
  for (const p of v.paragraphs ?? []) lines.push(inlineMd(p), '')
  for (const t of v.items ?? []) lines.push(`- ${inlineMd(t)}`)
  if (v.items?.length) lines.push('')
  if (v.table) lines.push(...tableMd(v.table), '')
  for (const p of v.closing ?? []) lines.push(inlineMd(p), '')
  while (lines[lines.length - 1] === '') lines.pop()
  return lines.map((l) => (l ? `> ${l}` : '>'))
}

/**
 * Markdown för docs/: rubrik, version, en inledning till ägaren (`preface`), texten och till sist
 * eventuella bilagor (`appendix`). Stycken som bara gäller webben är märkta.
 */
export function renderLegalMarkdown(doc: LegalDocSpec, preface: string, appendix = ''): string {
  const parts = [
    '<!-- Genereras från src/features/legal/legalContent.ts – ändra texten där och kör: npx vitest run src/features/legal -u -->',
    '',
    `# ${doc.title}`,
    '',
    `**Version ${doc.version}** · gäller från ${formatLegalDate(doc.version)}`,
    '',
    preface.trim(),
    '',
    '---',
    '',
    ...doc.sections.map(sectionMd),
  ]
  if (appendix.trim()) parts.push('---', '', appendix.trim(), '')
  return `${parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

/** Alla texter i ett avsnitt, som de läses – för synkkontrollen i testet. */
export function sectionTexts(s: LegalSection): string[] {
  return [
    s.heading,
    ...s.paragraphs,
    ...(s.webParagraphs ?? []),
    ...(s.steps ?? []),
    ...(s.items ?? []),
    ...(s.webItems ?? []),
    ...(s.keyItems ?? []),
    ...(s.table ? [...s.table.columns, ...s.table.rows.flat()] : []),
    ...(s.closing ?? []),
  ].map(plainText)
}
