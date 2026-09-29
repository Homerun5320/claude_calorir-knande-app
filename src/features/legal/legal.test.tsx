/**
 * Integritetspolicyn och villkoren: sidorna i appen visar alla avsnitt, de fristående sidorna och
 * dokumenten i docs/ har samma text (genereras ur legalContent.ts) och butiksapparna visar inget
 * om webbköp. Skriv om de genererade filerna efter en textändring: npx vitest run src/features/legal -u
 */
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { LIFETIME_PROMISE } from '../../config/commerce'
import PrivacyPage from './PrivacyPage'
import TermsPage from './TermsPage'
import {
  OWNER_PLACEHOLDER,
  PRIVACY_SECTIONS,
  PRIVACY_VERSION,
  STATIC_SELLER,
  TERMS_SECTIONS,
  TERMS_VERSION,
  USER_TERMS_SECTION_IDS,
  formatLegalDate,
  parseInline,
  plainText,
  privacySections,
  termsSections,
  visibleSections,
  type LegalContext,
} from './legalContent'
import { htmlToText, sectionTexts } from './legalExport'
import { LEGAL_FILES, privacyAndroidDoc, privacyAndroidHtml, privacyHtml, privacyMarkdown, termsDoc, termsHtml, termsMarkdown, userTermsMarkdown } from './legalDocs'
import { fillSellerPlaceholders, missingSellerPlaceholders } from './staticSeller'
import { BodyStats } from '../body/BodyStats'
import { bodyOverview } from '../body/bodyLogic'

MotionGlobalConfig.skipAnimations = true

/**
 * Node-moduler importeras dynamiskt och löst typat: appens tsconfig saknar (med avsikt) Node-typer.
 */
type Loose = any
const nodeModule = (name: string): Promise<Loose> => import(/* @vite-ignore */ name)

/** Läs en fil i repot (sökväg relativt roten). */
async function readRepoFile(path: string): Promise<string> {
  const { readFile } = await nodeModule('node:fs/promises')
  const { fileURLToPath } = await nodeModule('node:url')
  const { dirname, resolve } = await nodeModule('node:path')
  // Inte `new URL(…, import.meta.url)` – Vite skriver om det mönstret till en tillgångsadress.
  return readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', path), 'utf8') as Promise<string>
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('legalContent', () => {
  it('har rubrikerna i rätt ordning', () => {
    expect(PRIVACY_VERSION).toBe('2026-10-01')
    expect(TERMS_VERSION).toBe('2026-10-01')
    expect(PRIVACY_SECTIONS.map((s) => s.heading)).toEqual([
      'Vem ansvarar för dina uppgifter',
      'Din dagbok finns bara på din enhet',
      'Lagring på din enhet',
      'Tjänster som appen kontaktar',
      'Kameran',
      'Apple Hälsa och Health Connect',
      'Påminnelser',
      'När du köper',
      'Varför vi får behandla uppgifterna',
      'Hur länge vi sparar',
      'Mottagare och överföringar utanför EU',
      'Barn och unga',
      'Ingen reklam, ingen spårning',
      'Dina rättigheter',
      'Ändringar i policyn',
      'Kontakt',
    ])
    expect(TERMS_SECTIONS.map((s) => s.heading)).toEqual([
      'Säljare',
      'Vad du köper',
      'Pris och betalning',
      'Så går köpet till',
      'Leverans och ångerrätt',
      'Funktion och kompatibilitet',
      'Fel och reklamation',
      'Uppdateringar och support',
      'Livstidslicensen',
      'Provperioden',
      'Köp i App Store och Google Play',
      'Användarvillkor',
      'Minderåriga',
      'Tvister',
      'Ändringar i villkoren',
    ])
    // Unika id:n (ankare på de fristående sidorna).
    for (const list of [PRIVACY_SECTIONS, TERMS_SECTIONS]) expect(new Set(list.map((s) => s.id)).size).toBe(list.length)
  })

  it('tabellen över lagringen har fem kolumner och tar upp all lagring', () => {
    const table = PRIVACY_SECTIONS.find((s) => s.id === 'lagring')?.table
    expect(table?.columns).toEqual(['Vad', 'Var', 'Varför', 'Hur länge', 'Så rensar du'])
    for (const row of table?.rows ?? []) expect(row).toHaveLength(5)
    const text = table?.rows.flat().join(' ') ?? ''
    for (const where of ['IndexedDB', 'lagom-theme', 'sessionStorage', 'lagom-korg', 'lagom-demo', 'lagom-last-backup', 'lagom-sparrlista', 'lagom-error-log', 'Service workerns cache']) {
      expect(text).toContain(where)
    }
    // Apparnas egen lagring: hälsokopplingen, den automatiska kopian, exportfilerna och påminnelserna.
    for (const where of ['lagom-health', 'lagom-spegling.json', 'mappen delning', 'Telefonens notissystem', 'lagom-butikskop']) {
      expect(text).toContain(where)
    }
  })

  it('beskriver dataflödena, rättslig grund och rättigheter', () => {
    const all = PRIVACY_SECTIONS.flatMap(sectionTexts).join(' ')
    for (const needle of ['Open Food Facts', 'Netlify', 'Livsmedelsverkets öppna API', 'Stripe', 'Apple respektive Google', '6.1 b', '6.1 c', '6.1 f', '7 kap. 2 §', '24 månader', 'Data Privacy Framework', 'standardavtalsklausuler', 'imy.se', 'Lagom är gjord för vuxna, 18 år och äldre', 'Klarna, Swish, Apple Pay eller Google Pay', 'receptimport']) {
      expect(all).toContain(needle)
    }
    expect(all).toContain('Licensnyckeln innehåller inte ditt namn eller din e-post')
  })

  it('villkoren har de nya priserna, livstidsdefinitionen och ARN', () => {
    const all = TERMS_SECTIONS.flatMap(sectionTexts).join(' ')
    expect(all).toContain('Årslicensen kostar 349 kr och livstidslicensen 699 kr')
    expect(all).toContain('inklusive 25 % moms')
    expect(all).toContain('2 kap. 11 §')
    expect(all).toContain('konsumentköplagen (2022:260)')
    expect(all).toContain('Felrättningar ingår så länge vi ger ut Lagom')
    expect(all).toContain('nya funktioner kan komma men utlovas inte')
    expect(all).toContain('Allmänna reklamationsnämnden (ARN)')
    expect(all).toContain('Svensk lag gäller')
    expect(all).not.toMatch(/alla framtida uppdateringar/i)
    // Livstidslicensen beskrivs med samma löfte som i köparket och på kvittot.
    expect(TERMS_SECTIONS.find((s) => s.id === 'livstid')?.paragraphs[0]).toBe(LIFETIME_PROMISE)
    // Anteckningarna till ägaren finns bara i docs/ – de byggs inte in i appen.
    expect([...TERMS_SECTIONS, ...PRIVACY_SECTIONS].some((s) => s.ownerNote)).toBe(false)
    expect(termsDoc().sections.find((s) => s.id === 'livstid')?.ownerNote).toMatch(/Ägaren ska bekräfta/)
  })

  it('visar platshållare när säljarens uppgifter saknas', () => {
    const seller = TERMS_SECTIONS[0].paragraphs.join(' ')
    // Organisationsnumret är frivilligt (för enskild firma personnumret) – saknas det utelämnas det.
    expect(seller).toContain(`Lagom säljs av ${OWNER_PLACEHOLDER} (enskild firma).`)
    expect(PRIVACY_SECTIONS[0].paragraphs.join(' ')).toContain(`Personuppgiftsansvarig är ${OWNER_PLACEHOLDER} (enskild firma), ${OWNER_PLACEHOLDER}.`)
    expect(PRIVACY_SECTIONS[0].paragraphs.join(' ')).toContain(`Du når oss på ${OWNER_PLACEHOLDER}.`)
    // Momsregistreringsnumret är frivilligt (momsbefriad firma) – meningen utelämnas i stället.
    expect(TERMS_SECTIONS[0].paragraphs[1]).toBe(`Adress: ${OWNER_PLACEHOLDER}. Telefon: ${OWNER_PLACEHOLDER}. E-post: ${OWNER_PLACEHOLDER}.`)
  })

  it('fyller i säljarens uppgifter från VITE_SELLER_*', async () => {
    vi.stubEnv('VITE_SELLER_NAME', 'Anna Andersson')
    vi.stubEnv('VITE_SELLER_ORGNR', '900101-1234')
    vi.stubEnv('VITE_SELLER_ADDRESS', 'Storgatan 1, 123 45 Småstad')
    vi.stubEnv('VITE_SELLER_PHONE', '070-123 45 67')
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'hej@lagom-appen.se')
    vi.resetModules()
    const fresh = await import('./legalContent')
    expect(fresh.TERMS_SECTIONS[0].paragraphs[0]).toBe('Lagom säljs av Anna Andersson (enskild firma, organisationsnummer 900101-1234).')
    expect(fresh.TERMS_SECTIONS[0].paragraphs[1]).toContain('Adress: Storgatan 1, 123 45 Småstad. Telefon: 070-123 45 67. E-post: hej@lagom-appen.se.')
    // Utan momsregistreringsnummer utelämnas meningen.
    expect(fresh.TERMS_SECTIONS[0].paragraphs[1]).not.toContain('Momsregistreringsnummer')

    vi.stubEnv('VITE_SELLER_VAT', 'SE900101123401')
    vi.resetModules()
    const withVat = await import('./legalContent')
    expect(withVat.TERMS_SECTIONS[0].paragraphs[1]).toBe(
      'Adress: Storgatan 1, 123 45 Småstad. Telefon: 070-123 45 67. E-post: hej@lagom-appen.se. Momsregistreringsnummer: SE900101123401.',
    )
  })

  it('tolkar länkar i texten', () => {
    expect(parseInline('Se [imy.se](https://www.imy.se) och [villkoren](lagom:villkor).')).toEqual([
      { text: 'Se ' },
      { text: 'imy.se', href: 'https://www.imy.se' },
      { text: ' och ' },
      { text: 'villkoren', href: 'lagom:villkor' },
      { text: '.' },
    ])
    expect(plainText('Läs [policyn](lagom:integritet).')).toBe('Läs policyn.')
    expect(formatLegalDate('2026-10-01')).toBe('1 oktober 2026')
  })

  const WEB: LegalContext = { platform: 'web', webSales: true, licenseKeys: true }
  const PLAY: LegalContext = { platform: 'play', webSales: false, licenseKeys: true }
  const APPSTORE: LegalContext = { platform: 'appstore', webSales: false, licenseKeys: false }
  const textFor = (ctx: LegalContext) => [...visibleSections(TERMS_SECTIONS, ctx), ...visibleSections(PRIVACY_SECTIONS, ctx)].flatMap(sectionTexts).join(' ')

  it('tar bort webbköpen i butiksapparna', () => {
    for (const ctx of [PLAY, APPSTORE]) {
      const store = visibleSections(TERMS_SECTIONS, ctx)
      expect(store.map((s) => s.id)).not.toContain('pris')
      expect(store.map((s) => s.id)).not.toContain('kopet')
      expect(store.map((s) => s.id)).not.toContain('angerratt')
      const text = textFor(ctx)
      expect(text).not.toMatch(/Stripe/)
      expect(text).not.toMatch(/\d\s?kr\b/)
    }
    expect(visibleSections(TERMS_SECTIONS, WEB)).toHaveLength(TERMS_SECTIONS.length)
    // Webben med webbförsäljningen avstängd: inga Stripe-avsnitt, men licensnycklarna gäller.
    expect(visibleSections(TERMS_SECTIONS, { ...WEB, webSales: false }).map((s) => s.id)).not.toContain('pris')
  })

  it('iPhone-appen nämner bara iPhone och App Store – inte Google Play, webbläsare eller licensnycklar', () => {
    const text = textFor(APPSTORE)
    for (const word of [/Google Play/, /Google-konto/, /Android/, /Health Connect/, /ZXing/, /webbläsar/i, /service worker/i, /licensnyckel/i, /licensnycklar/i, /lagom-twa/, /sparrlista/, /webbplatsens data/, /Safari|Chrome|Firefox|Edge/]) {
      expect(text).not.toMatch(word)
    }
    expect(text).toContain('Den här policyn gäller Lagom för iPhone')
    expect(text).toContain('I App Store sköter Apple betalningen')
    expect(text).toContain('Köp i App Store följer ditt Apple-konto')
    expect(visibleSections(TERMS_SECTIONS, APPSTORE).find((s) => s.id === 'butikerna')?.heading).toBe('Köp i App Store')
    expect(visibleSections(PRIVACY_SECTIONS, APPSTORE).find((s) => s.id === 'halsa')?.heading).toBe('Apple Hälsa')
    expect(text).toContain('lagom-spegling.json')
    expect(text).toContain('iCloud')
    // Varianten gäller bara iPhone-appen – på webben och i Play-appen står den vanliga texten.
    expect(textFor(PLAY)).toContain('Den här policyn gäller Lagom på webben och i App Store och Google Play')
  })

  it('Google Play-appen nämner inga webbköp, webbläsare eller service worker', () => {
    const text = textFor(PLAY)
    for (const word of [/köp på webben/, /Stripe/, /service worker/i, /webbplatsens data/, /Safari|Chrome|Firefox|Edge/, /lagom-twa/]) {
      expect(text).not.toMatch(word)
    }
    // Dagboken och kameran beskrivs för Android-appen, inte för webbläsaren.
    for (const id of ['dagbok', 'kameran']) {
      expect(JSON.stringify(visibleSections(PRIVACY_SECTIONS, PLAY).find((s) => s.id === id))).not.toMatch(/webbläsar/i)
    }
    expect(text).toContain('Google Play: när du köper i appen')
    expect(text).toContain('lagom-butikskop')
    // Lagringstabellen i Play-appen tar upp samma lagring i localStorage som på webben (utom temat i webbläsaren).
    const play = visibleSections(PRIVACY_SECTIONS, PLAY).find((s) => s.id === 'lagring')?.table?.rows.flat().join(' ') ?? ''
    for (const where of ['lagom-sparrlista', 'lagom-theme', 'lagom-demo', 'lagom-last-backup', 'lagom-error-log', 'lagom-health', 'lagom-spegling.json', 'lagom-butikskop']) expect(play).toContain(where)
  })

  it('iPhone-appen: provperioden startas med ett gratis köp i App Store, och spärrlistan finns inte i rättslig grund', () => {
    const text = textFor(APPSTORE)
    expect(text).toContain('Du startar provperioden med ett gratis köp i App Store när')
    expect(text).toContain('lagom-butikskop')
    const grounds = visibleSections(PRIVACY_SECTIONS, APPSTORE).find((s) => s.id === 'rattslig-grund')
    expect(grounds?.items?.join(' ')).not.toMatch(/spärrlist/i)
  })

  it('spärrlistan nämns där licensnycklar kan aktiveras (webben och Play-appen), inte i iPhone-appen', () => {
    expect(textFor(PLAY)).toContain('Spärrlistan: har du aktiverat en licensnyckel')
    expect(textFor({ ...WEB, webSales: false })).toContain('Spärrlistan: har du aktiverat en licensnyckel')
    expect(textFor(APPSTORE)).not.toContain('Spärrlistan')
  })
})

describe('PrivacyPage', () => {
  it('visar alla rubriker, versionen och länken till villkoren', () => {
    inRouter(<PrivacyPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Integritetspolicy' })).toBeInTheDocument()
    for (const s of PRIVACY_SECTIONS) expect(screen.getByRole('heading', { level: 2, name: s.heading })).toBeInTheDocument()
    expect(screen.getByText('Version 2026-10-01 · gäller från 1 oktober 2026')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Mer att läsa' })
    expect(within(nav).getByRole('link', { name: /Köp- och användarvillkor/ })).toHaveAttribute('href', '/villkor')
    expect(screen.getByRole('link', { name: 'köp- och användarvillkoren' })).toHaveAttribute('href', '/villkor')
    expect(screen.getByRole('link', { name: /imy\.se/ })).toHaveAttribute('href', 'https://www.imy.se')
    expect(document.title).toBe('Integritetspolicy – Lagom')
  })

  it('visar lagringstabellen som läsbara kort', () => {
    inRouter(<PrivacyPage />)
    const region = screen.getByRole('region', { name: 'Lagring på din enhet' })
    expect(within(region).getByRole('heading', { level: 3, name: /Tema \(ljust eller mörkt\)/ })).toBeInTheDocument()
    expect(within(region).getAllByText('Så rensar du').length).toBeGreaterThan(5)
  })

  it('nämner varken Stripe eller webbpriser i App Store-bygget', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const { default: Page } = await import('./PrivacyPage')
    const { container } = inRouter(<Page />)
    expect(screen.getByRole('heading', { level: 2, name: 'När du köper' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/Stripe/)
    expect(container).toHaveTextContent('I App Store sköter Apple betalningen')
    expect(container).not.toHaveTextContent(/Google Play/)
  })
})

describe('TermsPage', () => {
  it('visar alla rubriker och länken till integritetspolicyn', () => {
    inRouter(<TermsPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Köp- och användarvillkor' })).toBeInTheDocument()
    for (const s of TERMS_SECTIONS) expect(screen.getByRole('heading', { level: 2, name: s.heading })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'integritetspolicyn' })).toHaveAttribute('href', '/integritet')
    expect(screen.getByRole('link', { name: /www\.arn\.se/ })).toHaveAttribute('href', 'https://www.arn.se')
    // Stegen för köpet (e-handelslagen 10 §) som numrerad lista.
    const steps = within(screen.getByRole('region', { name: 'Så går köpet till' })).getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    expect(document.title).toBe('Köp- och användarvillkor – Lagom')
  })

  it('i App Store-bygget: inga kronor, ingen Stripe – köpet sköts av butiken', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const { default: Page } = await import('./TermsPage')
    const { container } = inRouter(<Page />)
    expect(container).not.toHaveTextContent(/Stripe/)
    expect(container).not.toHaveTextContent(/\d\s?kr\b/)
    expect(screen.queryByRole('heading', { name: 'Så går köpet till' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Köp i App Store' })).toBeInTheDocument()
    expect(container).toHaveTextContent('Återställ köp')
    expect(container).not.toHaveTextContent(/Google Play|licensnyckel/i)
  })
})

describe('de fristående sidorna och docs/ stämmer med appen', () => {
  it('public/integritet/index.html har samma text', async () => {
    await expect(privacyHtml()).toMatchFileSnapshot(`../../../${LEGAL_FILES.privacyHtml}`)
    const html = await readRepoFile(LEGAL_FILES.privacyHtml)
    const text = norm(htmlToText(html))
    for (const s of PRIVACY_SECTIONS) expect(html).toContain(`>${s.heading}</h2>`)
    for (const t of privacySections(STATIC_SELLER).flatMap(sectionTexts)) expect(text).toContain(norm(t))
  })

  it('public/villkor/index.html har samma text', async () => {
    await expect(termsHtml()).toMatchFileSnapshot(`../../../${LEGAL_FILES.termsHtml}`)
    const html = await readRepoFile(LEGAL_FILES.termsHtml)
    const text = norm(htmlToText(html))
    for (const s of TERMS_SECTIONS) expect(html).toContain(`>${s.heading}</h2>`)
    for (const t of termsSections(STATIC_SELLER).flatMap(sectionTexts)) expect(text).toContain(norm(t))
  })

  it('integritetspolicyn för Android-appen (Health Connect) har Play-texten och inga länkar vidare', async () => {
    await expect(privacyAndroidHtml()).toMatchFileSnapshot(`../../../${LEGAL_FILES.privacyAndroidHtml}`)
    const html = await readRepoFile(LEGAL_FILES.privacyAndroidHtml)
    const text = norm(htmlToText(html))
    for (const t of privacyAndroidDoc().sections.flatMap(sectionTexts)) expect(text).toContain(norm(t))
    // Inga webbköp, inga länkar till villkoren eller appens andra sidor, ingen ikon utanför appen.
    for (const word of [/Stripe/, /köp på webben/, /\d\s?kr\b/, /service worker/i, /webbplatsens data/, /villkor\//, /href="\.\.\//]) expect(html).not.toMatch(word)
    expect(html).not.toContain('<footer>')
    expect(text).toContain('Health Connect')
    expect(text).toContain('Google Play: när du köper i appen')
    expect(text).toContain('lagom-butikskop')
  })

  it('de fristående sidorna fungerar utan JavaScript, på svenska och i mörkt läge', async () => {
    for (const path of [LEGAL_FILES.privacyHtml, LEGAL_FILES.termsHtml, LEGAL_FILES.privacyAndroidHtml]) {
      const html = await readRepoFile(path)
      expect(html.startsWith('<!doctype html>')).toBe(true)
      expect(html).toContain('<html lang="sv">')
      expect(html).toContain('<meta charset="utf-8" />')
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />')
      expect(html).toContain('@media (prefers-color-scheme: dark)')
      expect(html).toContain('max-width: 42rem')
      // CSP:n tillåter inga inline-skript.
      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/\son[a-z]+=/i)
      expect(missingSellerPlaceholders(html)).toContain('[Företagsnamn]')
    }
  })

  it('docs/INTEGRITETSPOLICY.md, KOPVILLKOR.md och ANVANDARVILLKOR.md är genererade ur samma text', async () => {
    await expect(privacyMarkdown()).toMatchFileSnapshot(`../../../${LEGAL_FILES.privacyMd}`)
    await expect(termsMarkdown()).toMatchFileSnapshot(`../../../${LEGAL_FILES.termsMd}`)
    await expect(userTermsMarkdown()).toMatchFileSnapshot(`../../../${LEGAL_FILES.userTermsMd}`)
    const privacy = await readRepoFile(LEGAL_FILES.privacyMd)
    expect(privacy).toContain('### Att fylla i av ägaren')
    expect(privacy).toContain('### Låt en jurist granska')
    expect(privacy).toContain('LEK 9 kap. 28 §')
    for (const s of PRIVACY_SECTIONS) expect(privacy).toContain(`## ${s.heading}`)
    const terms = await readRepoFile(LEGAL_FILES.termsMd)
    for (const s of TERMS_SECTIONS) expect(terms).toContain(`## ${s.heading}`)
    expect(terms).toContain('349 kr')
    expect(terms).toContain('699 kr')
    const userTerms = await readRepoFile(LEGAL_FILES.userTermsMd)
    for (const id of USER_TERMS_SECTION_IDS) expect(userTerms).toContain(`## ${TERMS_SECTIONS.find((s) => s.id === id)?.heading}`)
    expect(userTerms).toContain('Schedule 1, Exhibit B')
  })
})

describe('public/licenses/', () => {
  it('har licenserna för typsnitten och Workbox', async () => {
    expect(await readRepoFile('public/licenses/Inter-OFL.txt')).toContain('SIL Open Font License, Version 1.1')
    expect(await readRepoFile('public/licenses/Fraunces-OFL.txt')).toContain('SIL Open Font License, Version 1.1')
    const workbox = await readRepoFile('public/licenses/workbox-MIT.txt')
    expect(workbox).toMatch(/^MIT License/)
    expect(workbox).toContain('Copyright 2018 Google LLC')
    expect(workbox).toContain('Permission is hereby granted, free of charge')
  })
})

describe('staticSeller', () => {
  it('fyller i platshållarna vid bygget och escapar HTML', () => {
    const html = '<p>Säljare: <span class="fyll">[Företagsnamn]</span>, [Org.nr], [E-post], [Telefon]</p>'
    const out = fillSellerPlaceholders(html, {
      VITE_SELLER_NAME: 'Anna & Co <AB>',
      VITE_SELLER_ORGNR: '900101-1234',
      VITE_SUPPORT_EMAIL: 'support@example.invalid',
    })
    expect(out).toBe('<p>Säljare: Anna &amp; Co &lt;AB&gt;, 900101-1234, [E-post], [Telefon]</p>')
    expect(missingSellerPlaceholders(out)).toEqual(['[Telefon]', '[E-post]'])
    // Exempeladresser räknas också som platshållare (samma regel som i appen).
    expect(fillSellerPlaceholders('[E-post]', { VITE_SUPPORT_EMAIL: 'support@example.com' })).toBe('[E-post]')
    expect(fillSellerPlaceholders('[E-post]', { VITE_SUPPORT_EMAIL: 'hej@lagom.se' })).toBe('hej@lagom.se')
  })

  it('tar bort meningen med momsregistreringsnumret när det saknas', async () => {
    const html = await readRepoFile(LEGAL_FILES.termsHtml)
    expect(html).toContain('Momsregistreringsnummer: <span class="fyll">[Momsreg.nr]</span>.')
    const env = { VITE_SELLER_NAME: 'Anna Andersson', VITE_SELLER_ORGNR: '900101-1234', VITE_SELLER_ADDRESS: 'Storgatan 1', VITE_SELLER_PHONE: '070-1', VITE_SUPPORT_EMAIL: 'hej@lagom.se' }
    const without = fillSellerPlaceholders(html, env)
    expect(without).not.toContain('Momsregistreringsnummer')
    expect(without).toContain('E-post: hej@lagom.se.</p>')
    // Ifyllda uppgifter är inte längre markerade som platshållare.
    expect(without).not.toContain('class="fyll"')
    expect(missingSellerPlaceholders(without)).toEqual([])
    const withVat = fillSellerPlaceholders(html, { ...env, VITE_SELLER_VAT: 'SE900101123401' })
    expect(withVat).toContain('Momsregistreringsnummer: SE900101123401.')
  })

  it('tar bort organisationsnumret när det saknas (frivilligt för enskild firma)', async () => {
    const html = await readRepoFile(LEGAL_FILES.termsHtml)
    expect(html).toContain('(enskild firma, organisationsnummer <span class="fyll">[Org.nr]</span>)')
    const env = { VITE_SELLER_NAME: 'Anna Andersson', VITE_SELLER_ADDRESS: 'Storgatan 1', VITE_SELLER_PHONE: '070-1', VITE_SUPPORT_EMAIL: 'hej@lagom.se' }
    const without = fillSellerPlaceholders(html, env)
    expect(without).not.toContain('organisationsnummer')
    expect(without).not.toContain('[Org.nr]')
    expect(without).toContain('Lagom säljs av Anna Andersson (enskild firma).')
    expect(missingSellerPlaceholders(without)).toEqual([])
    expect(fillSellerPlaceholders(html, { ...env, VITE_SELLER_ORGNR: '900101-1234' })).toContain('(enskild firma, organisationsnummer 900101-1234)')
    // Exempeladresser känns igen med samma regel som byggkontrollen.
    expect(fillSellerPlaceholders('[E-post]', { VITE_SUPPORT_EMAIL: 'hej@lagom.example' })).toBe('[E-post]')
  })
})

describe('avsett ändamål i appen', () => {
  it('midjekvoten visas som neutralt intervall med allmän text och länk till 1177 – ingen riskbedömning', () => {
    const today = '2026-09-28'
    const overview = bodyOverview(
      [
        { id: 'w1', date: '2026-09-01', kg: 80, createdAt: 0 },
        { id: 'w2', date: today, kg: 79, createdAt: 0 },
      ],
      { goal: 'behalla', lifeStage: 'ingen', birthYear: 1980, startWeightKg: 80, createdAt: 0, heightCm: 170 },
      today,
    )
    const { container } = render(
      <BodyStats
        overview={overview}
        heightCm={170}
        lifeStage="ingen"
        goal="behalla"
        plannedRateKg={undefined}
        waist={{ value: 90, date: today, count: 1 }}
        onMeasureWaist={() => {}}
      />,
    )
    // 90 / 170 = 0,53
    expect(screen.getByText('0,5–0,6')).toBeInTheDocument()
    // De gamla etiketterna ("Lägre risk", "Något förhöjd risk", "Förhöjd risk") är borta.
    expect(container).not.toHaveTextContent(/förhöjd risk/i)
    expect(screen.queryByText('Lägre risk')).not.toBeInTheDocument()
    expect(
      screen.getByText(/I befolkningsstudier förknippas en midjekvot under 0,5 med lägre risk för hjärt-kärlsjukdom\. Det säger inget om just dig – prata med vården om du är orolig\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1177 Vårdguiden/ })).toHaveAttribute('href', 'https://www.1177.se/')
  })
})

describe('docs/AVSETT-ANDAMAL.md och docs/BEHANDLINGSREGISTER.md', () => {
  it('beskriver avsett ändamål och ord att undvika', async () => {
    const text = await readRepoFile('docs/AVSETT-ANDAMAL.md')
    expect(text).toContain('Den är inte avsedd för diagnos, behandling, övervakning eller förebyggande av sjukdom och är inte en medicinteknisk produkt.')
    for (const word of ['behandlar', 'diagnos', 'diabetesverktyg', 'kliniskt bevisad']) expect(text).toContain(word)
  })

  it('har en rad per behandling', async () => {
    const text = await readRepoFile('docs/BEHANDLINGSREGISTER.md')
    expect(text).toContain('Utkast – ska ses över av ägaren')
    for (const name of ['Köp på webben', 'Licensutfärdande och verifiering', 'Support via e-post', 'Serverloggar och anropsbegränsning']) expect(text).toContain(name)
  })
})
