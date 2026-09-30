#!/usr/bin/env node
/**
 * Lagoms kärnresor från början till slut i den byggda appen (riktig Chromium, riktig IndexedDB,
 * riktig service worker och riktiga omladdningar):
 *
 *   npx vite build && node scripts/e2e/karna.mjs [--dist=dist] [--only=<resa>[,<resa>]] [--headed] [--list]
 *
 * Utan att röra dist/ (t.ex. när andra bygger samtidigt):
 *   npx vite build --outDir /tmp/e2e-karna/web && node scripts/e2e/karna.mjs --dist=/tmp/e2e-karna/web
 *
 * Resorna (var och en PASS/FAIL, slutkod 1 vid fel, skärmdump i /tmp/lagom-e2e/<resa>.png):
 *   valkomst          ny användare → välkomstflödet → Idag → omladdning → fortfarande Idag med profilen
 *   logga-och-angra   sök "kyckling" → Kycklingbröst → lunch → syns med energi → Ångra → borta → igen → omladdning
 *   vatten-och-steg   ett glas vatten; 8 500 steg och bort från sidan inom 300 ms (utan blur); 9 000 och direkt omladdning
 *   anteckning        dagens anteckning och omladdning inom 300 ms; en ändring och direkt en annan adress i fliken
 *   sakerhetskopia    exportera → Radera all data → välkomstflödet → återställ kopian → allt är tillbaka
 *   manadsformat      dagbok i månadsformatet (version 2) läses in; en ny loggning skriver version 1 och tar bort månaderna
 *   tva-flikar        två flikar: B ser A:s loggning när den visas igen, och B:s loggning tappar inte A:s
 *   offline           service workern styr sidan → offline → omladdning → appen startar och loggning sparas
 *   trasig-dagbok     en dagbok som inte går att tolka: varningen visas, den skrivs inte över, Radera all data tar bort den
 *
 * Under alla resor samlas konsolfel och sidfel (ett oväntat konsolfel är ett fynd), vågrät scroll vid
 * 390 px, fokusfällor och appens egen fellogg. Externa värdar nås aldrig (se lib.mjs).
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  allEntries,
  BLANK_PATH,
  check,
  checkFocusFlow,
  checkOverflow,
  currentPath,
  diaryFromIdb,
  navigateAndWait,
  note,
  onboard,
  openApp,
  parseArgs,
  readIdb,
  readLocalStorage,
  runJourneys,
  seedBeforeLoad,
  setVisibility,
  SHOT_DIR,
  stopwatch,
  todayStockholm,
  waitFor,
  waitForApp,
  waitForHash,
} from './lib.mjs'

// ---------------------------------------------------------------------------
// Hjälpare för resorna
// ---------------------------------------------------------------------------

const MAIN_NAV = 'Huvudmeny'

/** Klicka på en länk i huvudmenyn (Idag, Dagbok, Insikter, Mer). */
async function nav(page, name) {
  await navigateAndWait(page, () => page.getByRole('navigation', { name: MAIN_NAV }).getByRole('link', { name, exact: true }).click())
}

/** Dagboken i IndexedDB (ihopsatt om den ligger i månader). */
async function idbDiary(page) {
  return diaryFromIdb(await readIdb(page))
}

/**
 * Lägg till ett livsmedel som en användare: länken "Lägg till i <måltid>" (Idag eller Dagbok) →
 * sök → tryck på raden → "Lägg till i <Måltid>" i arket. Returnerar energin som raden visade.
 */
async function addFoodViaSheet(page, { meal = 'lunch', mealTitle = 'Lunch', query = 'kyckling', food = 'Kycklingbröst' } = {}) {
  await page.getByRole('link', { name: `Lägg till i ${meal}` }).first().click()
  await waitForHash(page, '/lagg-till')
  const search = page.getByLabel('Sök livsmedel')
  await search.fill(query)
  const row = page.getByRole('button', { name: new RegExp(`^${food}, .*Välj mängd`) })
  await row.waitFor()
  const label = (await row.getAttribute('aria-label')) ?? (await row.textContent()) ?? ''
  const kcal = /(\d[\d\s ]*) kcal/.exec(label)?.[1]?.replace(/\s| /g, '')
  await row.click()
  const sheet = page.getByRole('dialog', { name: food })
  await sheet.waitFor()
  await sheet.getByRole('button', { name: `Lägg till i ${mealTitle}` }).click()
  await sheet.waitFor({ state: 'hidden' })
  return kcal ? Number(kcal) : null
}

/** Snabbvägen på sökraden: "Lägg till <livsmedel> direkt" (från sidan Lägg till). */
async function quickAdd(page, { meal = 'lunch', query = 'kyckling', food = 'Kycklingbröst' } = {}) {
  await page.getByRole('link', { name: `Lägg till i ${meal}` }).first().click()
  await waitForHash(page, '/lagg-till')
  await page.getByLabel('Sök livsmedel').fill(query)
  const button = page.getByRole('button', { name: new RegExp(`^Lägg till ${food} direkt`) })
  await button.click()
  await page.getByText(/^Tillagt i /).first().waitFor()
}

/** Stäng Lägg till (knappen "Stäng" överst). */
async function closeAdd(page) {
  await page.getByRole('main').getByRole('button', { name: 'Stäng', exact: true }).first().click()
  await waitFor(() => currentPath(page) !== '/lagg-till', { message: 'Lägg till stängdes inte' })
  await waitForApp(page)
}

/** Posterna i en måltid på dagbokssidan: [{ name, kcal }]. */
async function diaryMealEntries(page, mealTitle) {
  const region = page.getByRole('main').getByRole('region', { name: mealTitle, exact: true })
  await region.waitFor()
  const labels = await region.getByRole('button', { name: /^Ändra / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
  return labels.map((l) => {
    const m = /^Ändra (.+?), .*?(\d[\d\s ]*) kcal$/.exec(l)
    return { name: m?.[1] ?? l, kcal: m ? Number(m[2].replace(/\s| /g, '')) : null, label: l }
  })
}

/** Vänta på en toast med `text` och returnera den (toasten ligger utanför main). */
async function toastWith(page, text) {
  const t = page.getByText(text, { exact: false }).first()
  await t.waitFor({ timeout: 8000 })
  return t
}

/** Värdet i fältet "Steg idag" på träningssidan. */
async function stepsFieldValue(page) {
  const field = page.getByRole('spinbutton', { name: 'Steg idag' })
  await field.waitFor()
  return field.inputValue()
}

/** "8 500" → 8500 (tusentalsavgränsare med mellanslag eller hårt mellanslag). */
const num = (s) => Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'))

/** Profil, licens och vikt från en riktig profil – för att fylla IndexedDB före start. */
async function realProfileKeys(page, state) {
  await openApp(page, state, '#/')
  await onboard(page, state)
  const all = await readIdb(page)
  const keys = {}
  for (const k of ['lagom-profile', 'lagom-license', 'lagom-body']) {
    check(typeof all[k] === 'string', `${k} saknas i IndexedDB efter välkomstflödet`)
    keys[k] = all[k]
  }
  return { keys, all }
}

/** Radera all data via Inställningar → Data (båda bekräftelserna). */
async function wipeAllViaSettings(page) {
  await openHash(page, '#/installningar/data')
  await page.getByRole('heading', { name: 'Radera all data' }).waitFor()
  await page.getByRole('main').getByRole('button', { name: 'Radera all data' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Radera all data?' }).or(page.getByRole('dialog', { name: 'Radera all data?' }))
  await confirm.waitFor()
  await confirm.getByRole('button', { name: 'Fortsätt' }).click()
  const last = page.getByRole('alertdialog', { name: 'Sista steget' })
  await last.waitFor()
  await last.getByLabel('Skriv RADERA').fill('RADERA')
  await last.getByRole('button', { name: 'Radera allt' }).click()
  await waitForHash(page, '/valkommen')
  // Raderingen når IndexedDB inom några tiotal ms – vänta på den innan resan laddar om (snabbare
  // än så laddar ingen människa om, och en omladdning mitt i avbryter pågående skrivningar).
  await waitFor(async () => {
    const raw = (await readIdb(page))['lagom-profile']
    return typeof raw === 'string' && !raw.includes('"onboardingDone":true')
  }, { message: 'Radera all data nådde aldrig IndexedDB (profilen finns kvar)' })
}

/** Byt sida inne i appen via adressen (hash-routern) och vänta tills den visas. */
async function openHash(page, hash) {
  const path = hash.replace(/^#/, '').split('?')[0]
  const go = () =>
    page.evaluate((h) => {
      location.hash = h
    }, hash)
  // En annan sida (första ledet i sökvägen byts): vänta på den nya sidans rubrik. Inom samma sida
  // (t.ex. en annan dag i dagboken) finns rubriken redan.
  if (path.split('/')[1] !== currentPath(page).split('/')[1]) await navigateAndWait(page, go)
  else await go()
  await waitForHash(page, path)
  await waitForApp(page)
}

/** localStorage-nycklar som appen medvetet behåller efter "Radera all data" (integritetspolicyns lagringstabell). */
const KEPT_AFTER_WIPE = [/^lagom-theme$/, /^lagom-sparad:/, /^lagom-error-log$/, /^lagom-sparrlista$/, /^lagom-butikskop$/, /^lagom-header-motion$/, /^lagom-idag-tips-dolt$/, /^lagom-install-hint-dismissed$/]

// ---------------------------------------------------------------------------
// Resorna
// ---------------------------------------------------------------------------

const valkomst = {
  name: 'valkomst',
  title: 'Ny användare genom välkomstflödet till Idag, och kvar efter omladdning',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    check(currentPath(page) === '/valkommen', `en ny användare borde hamna i välkomstflödet, hamnade på ${currentPath(page)}`)
    await checkOverflow(page, state, 'välkomststeget')
    await onboard(page, state, { name: 'Testa' })
    check(currentPath(page) === '/', `efter välkomstflödet borde appen visa Idag, visar ${currentPath(page)}`)
    const h1 = await page.getByRole('heading', { level: 1 }).first().textContent()
    check(/Testa/.test(h1 ?? ''), `Idag hälsar inte med namnet: "${h1}"`)
    await checkOverflow(page, state, 'Idag')
    // Profilen i IndexedDB.
    const profile = await waitFor(async () => {
      const raw = (await readIdb(page))['lagom-profile']
      const p = raw ? JSON.parse(raw) : null
      return p?.state?.settings?.onboardingDone && p.state.profile ? p : null
    }, { message: 'profilen sparades aldrig i IndexedDB' })
    check(profile.state.profile.name === 'Testa', `fel namn i profilen: ${profile.state.profile.name}`)
    // Tangentbordet: fokus ska kunna gå genom Idag till huvudmenyn utan att fastna.
    await checkFocusFlow(page, state, 'Idag', { mustReach: MAIN_NAV })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    check(currentPath(page) === '/', `efter omladdning borde appen visa Idag, visar ${currentPath(page)}`)
    const h1After = await page.getByRole('heading', { level: 1 }).first().textContent()
    check(/Testa/.test(h1After ?? ''), `efter omladdning saknas profilen på Idag: "${h1After}"`)
    // Vikten från välkomstflödet finns kvar.
    await page.getByRole('region', { name: 'Vikt' }).getByText(/66,5\s*kg/).first().waitFor({ timeout: 5000 })
  },
}

const loggaOchAngra = {
  name: 'logga-och-angra',
  title: 'Logga Kycklingbröst, ångra, logga igen och ladda om',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    const today = todayStockholm()

    const kcal = await addFoodViaSheet(page, { meal: 'lunch', mealTitle: 'Lunch', query: 'kyckling', food: 'Kycklingbröst' })
    check(kcal !== null && kcal > 0, 'sökraden visade ingen energi för Kycklingbröst')
    const toast = await toastWith(page, 'Tillagt i Lunch')
    check(await toast.isVisible(), 'ingen toast "Tillagt i Lunch"')
    await checkOverflow(page, state, 'Lägg till med sökresultat')
    await closeAdd(page)
    await nav(page, 'Dagbok')
    const entries = await diaryMealEntries(page, 'Lunch')
    check(entries.length === 1 && entries[0].name === 'Kycklingbröst', `dagboken visar inte Kycklingbröst i lunch: ${JSON.stringify(entries)}`)
    check(entries[0].kcal === kcal, `dagboken visar ${entries[0].kcal} kcal, sökraden ${kcal} kcal`)
    await checkOverflow(page, state, 'Dagbok')
    const saved = await waitFor(async () => allEntries(await idbDiary(page)).length === 1, { message: 'posten sparades aldrig i IndexedDB' })
    check(saved, 'posten saknas i IndexedDB')

    // Ångra i toasten (den står kvar 8 s och pausas vid hovring/fokus).
    const undo = page.getByRole('button', { name: 'Ångra' })
    check(await undo.isVisible(), 'toasten med Ångra försvann innan den hann användas (under 8 s)')
    await undo.click()
    await waitFor(async () => (await diaryMealEntries(page, 'Lunch')).length === 0, { message: 'posten försvann inte ur dagboken efter Ångra' })
    await waitFor(async () => allEntries(await idbDiary(page)).length === 0, { message: 'posten ligger kvar i IndexedDB efter Ångra' })

    // Igen – och en riktig omladdning.
    const kcal2 = await addFoodViaSheet(page, { meal: 'lunch', mealTitle: 'Lunch', query: 'kyckling', food: 'Kycklingbröst' })
    await toastWith(page, 'Tillagt i Lunch')
    await closeAdd(page)
    check(currentPath(page) === '/dagbok', `Stäng borde gå tillbaka till dagboken, gick till ${currentPath(page)}`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    const after = await diaryMealEntries(page, 'Lunch')
    check(after.length === 1 && after[0].name === 'Kycklingbröst' && after[0].kcal === kcal2, `efter omladdning: ${JSON.stringify(after)}`)
    const diary = await idbDiary(page)
    const list = diary?.entries?.[today] ?? []
    check(list.length === 1 && list[0].food?.name === 'Kycklingbröst' && list[0].meal === 'lunch', `IndexedDB efter omladdning: ${JSON.stringify(list).slice(0, 300)}`)
  },
}

const vattenOchSteg = {
  name: 'vatten-och-steg',
  title: 'Vatten på Idag; steg sparas när man lämnar sidan inom 300 ms och vid omladdning',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    const today = todayStockholm()

    const water = page.getByRole('region', { name: 'Vatten' })
    await water.getByRole('button', { name: 'Lägg till ett glas (250 ml)' }).click()
    await water.getByText(/^0,25\s+liter av/).waitFor({ timeout: 3000 })
    await waitFor(async () => (await idbDiary(page))?.water?.[today] === 250, { message: 'vattnet (250 ml) sparades aldrig i IndexedDB' })

    // Stegen: skriv 8 500 och lämna sidan inom 300 ms – utan att fältet tappar fokus först.
    await nav(page, 'Mer')
    await page.getByRole('link', { name: /^Träning/ }).click()
    await waitForHash(page, '/traning')
    await waitForApp(page)
    await checkOverflow(page, state, 'Träning')
    const field = page.getByRole('spinbutton', { name: 'Steg idag' })
    await field.click()
    const t0 = Date.now()
    await field.fill('8500')
    await page.evaluate(() => {
      location.hash = '#/'
    })
    const elapsed = Date.now() - t0
    note(state, `från sista tecknet till sidbytet: ${elapsed} ms`)
    check(elapsed < 300, `sidbytet tog ${elapsed} ms (skriptet hann inte inom 300 ms)`)
    await waitForHash(page, '/')
    await waitForApp(page)
    const stepsAfterNav = (await idbDiary(page).catch(() => null))?.days?.[today]?.steps
    note(state, `steg i IndexedDB direkt efter sidbytet: ${stepsAfterNav ?? 'inga'}`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await openHash(page, '#/traning')
    const v1 = await stepsFieldValue(page)
    check(num(v1) === 8500, `efter sidbyte och omladdning visar fältet "${v1}" i stället för 8 500`)
    const d1 = await idbDiary(page)
    check(d1?.days?.[today]?.steps === 8500, `IndexedDB har ${d1?.days?.[today]?.steps} steg i stället för 8500`)
    check(d1?.water?.[today] === 250, `vattnet försvann: ${d1?.water?.[today]}`)

    // 9 000 och direkt omladdning (sparas i beforeunload – Chromium tappar det som startas i pagehide).
    await field.click()
    await field.fill('9000')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    const v2 = await stepsFieldValue(page)
    check(num(v2) === 9000, `efter direkt omladdning visar fältet "${v2}" i stället för 9 000`)
    const d2 = await idbDiary(page)
    check(d2?.days?.[today]?.steps === 9000, `IndexedDB har ${d2?.days?.[today]?.steps} steg i stället för 9000 efter omladdningen`)
  },
}

const anteckning = {
  name: 'anteckning',
  title: 'Dagens anteckning sparas vid omladdning inom 300 ms och när fliken byter adress',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    const today = todayStockholm()
    await nav(page, 'Dagbok')
    // Tangentbordet: fokus ska kunna gå genom dagboken till huvudmenyn utan att fastna.
    await checkFocusFlow(page, state, 'Dagbok', { mustReach: MAIN_NAV })
    const text = 'Promenad i skogen – god lunch med å, ä och ö.'
    const field = page.getByRole('textbox', { name: 'Anteckning' })
    await field.click()
    const t0 = Date.now()
    await field.fill(text)
    const elapsed = Date.now() - t0
    await page.reload({ waitUntil: 'domcontentloaded' })
    note(state, `från tecknen till omladdningen: ${elapsed} ms`)
    check(elapsed < 300, `omladdningen startade först efter ${elapsed} ms (skriptet hann inte inom 300 ms)`)
    await waitForApp(page)
    const after = await page.getByRole('textbox', { name: 'Anteckning' }).inputValue()
    check(after === text, `efter omladdning står det "${after}" i anteckningen`)
    const d = await idbDiary(page)
    check(d?.days?.[today]?.note === text, `IndexedDB har anteckningen ${JSON.stringify(d?.days?.[today]?.note)}`)

    // En annan adress i samma flik direkt efter tecknen (inte en omladdning – samma sak för sidan).
    const text2 = `${text} Kvällste.`
    const field2 = page.getByRole('textbox', { name: 'Anteckning' })
    await field2.click()
    await field2.fill(text2)
    await page.goto(`${state.base}${BLANK_PATH}`, { waitUntil: 'domcontentloaded' })
    await openApp(page, state, '#/dagbok')
    const after2 = await page.getByRole('textbox', { name: 'Anteckning' }).inputValue()
    check(after2 === text2, `efter en annan adress i fliken står det "${after2}" i anteckningen`)
    const d2 = await idbDiary(page)
    check(d2?.days?.[today]?.note === text2, `IndexedDB har anteckningen ${JSON.stringify(d2?.days?.[today]?.note)} efter en annan adress i fliken`)
  },
}

const sakerhetskopia = {
  name: 'sakerhetskopia',
  title: 'Exportera, radera all data och återställ säkerhetskopian',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    const today = todayStockholm()

    // Lite data: en post, ett glas vatten och steg.
    await quickAdd(page, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
    await closeAdd(page)
    await page.getByRole('region', { name: 'Vatten' }).getByRole('button', { name: 'Lägg till ett glas (250 ml)' }).click()
    await openHash(page, '#/traning')
    const steps = page.getByRole('spinbutton', { name: 'Steg idag' })
    await steps.fill('8500')
    await steps.blur()
    await waitFor(async () => {
      const d = await idbDiary(page)
      return allEntries(d).length === 1 && d.water?.[today] === 250 && d.days?.[today]?.steps === 8500
    }, { message: 'posten, vattnet och stegen sparades inte i IndexedDB' })

    // Exportera (JSON) och fånga nedladdningen.
    await nav(page, 'Mer')
    await page.getByRole('link', { name: /^Inställningar/ }).click()
    await page.getByRole('link', { name: /^Data och säkerhetskopia/ }).click()
    await waitForHash(page, '/installningar/data')
    await waitForApp(page)
    await checkOverflow(page, state, 'Inställningar → Data')
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Exportera (JSON)' }).click()])
    mkdirSync(SHOT_DIR, { recursive: true })
    const backupPath = join(SHOT_DIR, 'sakerhetskopia-export.json')
    await download.saveAs(backupPath)
    note(state, `säkerhetskopian: ${download.suggestedFilename()} → ${backupPath}`)
    check(/^lagom-.*\.json$/.test(download.suggestedFilename()), `oväntat filnamn: ${download.suggestedFilename()}`)
    const backup = JSON.parse(readFileSync(backupPath, 'utf8'))
    const backupText = JSON.stringify(backup)
    check(backupText.includes('Kycklingbröst'), 'säkerhetskopian saknar posten Kycklingbröst')
    await toastWith(page, 'Säkerhetskopian är sparad')

    // Radera all data.
    await wipeAllViaSettings(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    check(currentPath(page) === '/valkommen', `efter Radera all data och omladdning borde välkomstflödet visas, visar ${currentPath(page)}`)
    const idb = await readIdb(page)
    const diary = diaryFromIdb(idb)
    check(allEntries(diary).length === 0, `dagboken har kvar ${allEntries(diary).length} poster efter radering`)
    check(Object.keys(diary?.water ?? {}).length === 0 && Object.keys(diary?.days ?? {}).length === 0, `vatten eller dagsuppgifter finns kvar: ${JSON.stringify({ water: diary?.water, days: diary?.days })}`)
    check(!Object.keys(idb).some((k) => k.startsWith('lagom-diary:') || k === 'lagom-diary-v1'), `månadsnycklar finns kvar: ${Object.keys(idb).join(', ')}`)
    const profile = idb['lagom-profile'] ? JSON.parse(idb['lagom-profile']) : null
    check(!profile?.state?.profile && !profile?.state?.settings?.onboardingDone, `profilen finns kvar efter radering: ${String(idb['lagom-profile']).slice(0, 200)}`)
    const body = idb['lagom-body'] ? JSON.parse(idb['lagom-body']) : null
    check((body?.state?.weights ?? []).length === 0, 'vikterna finns kvar efter radering')
    const idbText = JSON.stringify(idb)
    check(!idbText.includes('Kycklingbröst') && !idbText.includes('Testa'), 'IndexedDB innehåller fortfarande dagbokens eller profilens data efter radering')
    const local = await readLocalStorage(page)
    const leftovers = Object.keys(local).filter((k) => k.startsWith('lagom') && !KEPT_AFTER_WIPE.some((re) => re.test(k)))
    check(leftovers.length === 0, `localStorage har kvar efter radering: ${leftovers.map((k) => `${k}=${String(local[k]).slice(0, 60)}`).join(', ')}`)
    note(state, `localStorage efter radering: ${Object.keys(local).join(', ') || '(tomt)'}`)

    // Återställ från välkomstflödet (som på en ny telefon).
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Återställ säkerhetskopia' }).click()])
    await chooser.setFiles(backupPath)
    const sheet = page.getByRole('dialog', { name: 'Återställ säkerhetskopia' })
    await sheet.waitFor()
    await sheet.getByRole('button', { name: 'Återställ min data' }).click()
    await waitForHash(page, '/')
    await waitForApp(page)
    await toastWith(page, 'Välkommen tillbaka')
    await page.getByRole('region', { name: 'Vatten' }).getByText(/^0,25\s+liter av/).waitFor({ timeout: 5000 })
    await nav(page, 'Dagbok')
    const lunch = await diaryMealEntries(page, 'Lunch')
    check(lunch.length === 1 && lunch[0].name === 'Kycklingbröst', `efter återställningen visar dagboken: ${JSON.stringify(lunch)}`)
    await openHash(page, '#/traning')
    check(num(await stepsFieldValue(page)) === 8500, 'stegen kom inte tillbaka')
    // Och allt ligger i IndexedDB efter en omladdning.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    check(currentPath(page) === '/traning', `efter omladdning visas ${currentPath(page)} (borde vara kvar på Träning)`)
    const restored = await idbDiary(page)
    check(allEntries(restored).length === 1 && restored.water?.[today] === 250 && restored.days?.[today]?.steps === 8500, `IndexedDB efter återställning: ${JSON.stringify(restored).slice(0, 300)}`)
  },
}

const manadsformat = {
  name: 'manadsformat',
  title: 'Dagbok i månadsformatet läses in; nästa loggning skriver version 1 och tar bort månaderna',
  async run({ state, newPage }) {
    // 1. En riktig profil och en riktig post, skapade genom appen (som mall för formatet).
    const setup = await newPage()
    const { keys } = await realProfileKeys(setup, state)
    await quickAdd(setup, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
    const real = await waitFor(async () => {
      const d = await idbDiary(setup)
      return allEntries(d).length === 1 ? d : null
    }, { message: 'mallposten sparades inte' })
    const today = todayStockholm()
    const entry = real.entries[today][0]
    // En dag i förra månaden (så att två månadsnycklar läses ihop).
    const [y, m] = today.split('-').map(Number)
    const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    const oldDate = `${prevMonth}-15`
    const oldEntry = { ...entry, id: 'e_e2e_gammal', date: oldDate, meal: 'middag', createdAt: entry.createdAt - 1000 }
    const month = (date, e, extra = {}) =>
      JSON.stringify({ entries: { [date]: [e] }, water: extra.water ?? {}, exercise: {}, days: extra.days ?? {} })
    const seeded = {
      ...keys,
      'lagom-diary': JSON.stringify({ state: { format: 'manader', stateVersion: 1, token: 'x' }, version: 2 }),
      [`lagom-diary:${today.slice(0, 7)}`]: month(today, entry, { water: { [today]: 500 }, days: { [today]: { steps: 4321, note: 'Från månadsformatet' } } }),
      [`lagom-diary:${prevMonth}`]: month(oldDate, oldEntry),
    }
    await setup.close()

    // 2. En ny kontext med månadsformatet i IndexedDB innan appen startar.
    const page = await newPage({ fresh: true })
    await seedBeforeLoad(page, state, seeded)
    await openApp(page, state, '#/dagbok')
    check(currentPath(page) === '/dagbok', `appen visar ${currentPath(page)} i stället för dagboken (profilen lästes inte?)`)
    const lunch = await diaryMealEntries(page, 'Lunch')
    check(lunch.length === 1 && lunch[0].name === 'Kycklingbröst', `dagens lunch från månadsformatet syns inte: ${JSON.stringify(lunch)}`)
    await page.getByRole('region', { name: 'Vatten' }).getByText(/^0,5\s+liter av/).waitFor({ timeout: 5000 })
    const noteText = await page.getByRole('textbox', { name: 'Anteckning' }).inputValue()
    check(noteText === 'Från månadsformatet', `anteckningen från månadsformatet saknas: "${noteText}"`)
    await openHash(page, `#/dagbok/${oldDate}`)
    const dinner = await diaryMealEntries(page, 'Middag')
    check(dinner.length === 1 && dinner[0].name === 'Kycklingbröst', `förra månadens middag (${oldDate}) syns inte: ${JSON.stringify(dinner)}`)
    const before = await readIdb(page)
    check(before['lagom-diary'] === seeded['lagom-diary'], 'indexet skrevs om redan vid läsningen')

    // 3. Logga en till – skrivaren (månader av) sparar version 1 och tar bort månaderna.
    await openHash(page, '#/dagbok')
    await quickAdd(page, { meal: 'frukost', query: 'kyckling', food: 'Kycklinglårfilé' })
    const after = await waitFor(async () => {
      const all = await readIdb(page)
      return typeof all['lagom-diary'] === 'string' && all['lagom-diary'].startsWith('{"state":{"entries":') ? all : null
    }, { message: 'dagboken skrevs aldrig tillbaka som version 1' })
    const v1 = JSON.parse(after['lagom-diary'])
    check(v1.version === 1, `version ${v1.version} i stället för 1`)
    const monthKeys = Object.keys(after).filter((k) => k.startsWith('lagom-diary:') || k === 'lagom-diary-v1')
    check(monthKeys.length === 0, `månadsnycklarna finns kvar: ${monthKeys.join(', ')}`)
    const list = allEntries(v1.state)
    check(list.length === 3, `version 1 har ${list.length} poster i stället för 3 (${list.map((e) => `${e.date} ${e.food?.name}`).join(', ')})`)
    check(v1.state.entries[oldDate]?.length === 1, 'förra månadens post försvann vid skrivningen')
    check(v1.state.water[today] === 500 && v1.state.days[today]?.steps === 4321 && v1.state.days[today]?.note === 'Från månadsformatet', `vatten/steg/anteckning ändrades: ${JSON.stringify({ water: v1.state.water, days: v1.state.days })}`)
    // Och efter en omladdning läses version 1 in med alla tre.
    await closeAdd(page)
    check(currentPath(page) === '/dagbok', `Stäng borde gå tillbaka till dagboken, gick till ${currentPath(page)}`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    const breakfast = await diaryMealEntries(page, 'Frukost')
    check(breakfast.length === 1 && breakfast[0].name === 'Kycklinglårfilé', `efter omladdning: ${JSON.stringify(breakfast)}`)
  },
}

const tvaFlikar = {
  name: 'tva-flikar',
  title: 'Två flikar: B visar A:s post när den visas igen, och B:s loggning tappar inte A:s',
  async run({ state, newPage }) {
    const a = await newPage()
    await openApp(a, state, '#/')
    await onboard(a, state)
    const today = todayStockholm()
    const b = await newPage()
    await openApp(b, state, '#/dagbok')
    check(currentPath(b) === '/dagbok', `flik B visar ${currentPath(b)} i stället för dagboken`)
    check((await diaryMealEntries(b, 'Lunch')).length === 0, 'flik B har redan en post i lunch')

    // B göms (som när man byter flik) – A loggar.
    await setVisibility(b, false)
    await a.bringToFront()
    await setVisibility(a, true)
    await openHash(a, '#/')
    await quickAdd(a, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
    await waitFor(async () => allEntries(await idbDiary(a)).length === 1, { message: 'A:s post sparades inte' })
    await closeAdd(a)

    // B visas igen: posten ska synas utan att sidan laddas om.
    await setVisibility(a, false)
    await b.bringToFront()
    await setVisibility(b, true)
    const seen = await waitFor(async () => {
      const l = await diaryMealEntries(b, 'Lunch')
      return l.length === 1 ? l : null
    }, { timeout: 5000, message: 'flik B visar inte A:s post efter att ha visats igen (utan omladdning)' })
    check(seen[0].name === 'Kycklingbröst', `flik B visar ${seen[0].name}`)

    // B loggar något eget – A:s post får inte försvinna.
    await quickAdd(b, { meal: 'middag', query: 'kyckling', food: 'Kycklinglårfilé' })
    await waitFor(async () => allEntries(await idbDiary(b)).length === 2, { message: `efter B:s loggning har IndexedDB inte två poster` })

    // A visas igen och loggar en tredje – inget av det tidigare får tappas.
    await setVisibility(b, false)
    await a.bringToFront()
    await setVisibility(a, true)
    await openHash(a, '#/dagbok')
    await waitFor(async () => (await diaryMealEntries(a, 'Middag')).length === 1, { message: 'flik A visar inte B:s post efter att ha visats igen' })
    await quickAdd(a, { meal: 'frukost', query: 'kyckling', food: 'Grillkyckling' })
    await waitFor(async () => allEntries(await idbDiary(a)).length === 3, { message: 'efter A:s andra loggning har IndexedDB inte tre poster' })

    await a.reload({ waitUntil: 'domcontentloaded' })
    await b.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(a)
    await waitForApp(b)
    for (const [label, p] of [['A', a], ['B', b]]) {
      await openHash(p, '#/dagbok')
      const counts = { frukost: (await diaryMealEntries(p, 'Frukost')).length, lunch: (await diaryMealEntries(p, 'Lunch')).length, middag: (await diaryMealEntries(p, 'Middag')).length }
      check(counts.frukost === 1 && counts.lunch === 1 && counts.middag === 1, `flik ${label} efter omladdning: ${JSON.stringify(counts)}`)
    }
    const d = await idbDiary(a)
    check((d?.entries?.[today] ?? []).length === 3, `IndexedDB har ${(d?.entries?.[today] ?? []).length} poster i stället för 3`)
  },
}

const offline = {
  name: 'offline',
  title: 'Service workern styr sidan; offline startar appen och loggning sparas',
  async run({ state, newPage }) {
    const lap = stopwatch(state, 10000)
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    lap('välkomstflödet')
    // Vänta tills service workern är aktiv (förcachningen klar) och ladda om så att den styr sidan.
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.state
    })
    lap('service workern aktiv')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    lap('omladdning uppkopplad')
    const controlled = await waitFor(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 10000, message: 'service workern tog aldrig kontroll över sidan' })
    check(controlled, 'ingen service worker styr sidan')
    const cached = await page.evaluate(async () => {
      const names = await caches.keys()
      let n = 0
      for (const name of names) n += (await (await caches.open(name)).keys()).length
      return { names, n }
    })
    note(state, `service workerns cachar: ${cached.names.join(', ')} (${cached.n} filer)`)

    await page.context().setOffline(true)
    try {
      lap('före offline')
      await page.reload({ waitUntil: 'domcontentloaded' })
      lap('omladdning offline (domcontentloaded)')
      await waitForApp(page)
      lap('appen offline visas')
      check(currentPath(page) === '/', `offline visar appen ${currentPath(page)} i stället för Idag`)
      // Felsidan (RouteError: "Något gick snett" eller "Lagom har uppdaterats").
      const errorTitle = page.locator('#route-error-title')
      if ((await errorTitle.count()) > 0) check(false, `offline visar appen felsidan: "${await errorTitle.first().textContent()}"`)
      const h1 = await page.getByRole('heading', { level: 1 }).first().textContent()
      check(/Testa/.test(h1 ?? ''), `offline saknas profilen på Idag: "${h1}"`)
      // Logga (Lägg till laddas lat – den delen måste också finnas i cachen).
      await quickAdd(page, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
      lap('loggning offline')
      await closeAdd(page)
      await waitFor(async () => allEntries(await idbDiary(page)).length === 1, { message: 'posten sparades inte offline' })
      await nav(page, 'Dagbok')
      lap('dagboken offline')
      const lunch = await diaryMealEntries(page, 'Lunch')
      check(lunch.length === 1, `dagboken offline: ${JSON.stringify(lunch)}`)
      // Och en omladdning till, fortfarande offline.
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForApp(page)
      lap('andra omladdningen offline')
      check((await diaryMealEntries(page, 'Lunch')).length === 1, 'posten saknas efter omladdning offline')
    } finally {
      await page.context().setOffline(false)
    }
  },
}

const trasigDagbok = {
  name: 'trasig-dagbok',
  title: 'En dagbok som inte går att tolka: varning, skrivs inte över, Radera all data tar bort den',
  async run({ state, newPage }) {
    const corrupt = '{not json'
    // Det fasta meddelandet från dagbokens lagring är väntat (en gång per inläsning).
    state.allowErrorLog.push(/Dagbokens sparade värde går inte att tolka – sparar bara i minnet/)
    const page = await newPage()
    const { keys } = await realProfileKeys(page, state)
    await seedBeforeLoad(page, state, { ...keys, 'lagom-diary': corrupt })
    await openApp(page, state, '#/')
    check(currentPath(page) === '/', `med en trasig dagbok visar appen ${currentPath(page)} i stället för Idag`)
    const warning = page.getByRole('status').filter({ hasText: 'Den sparade dagboken gick inte att läsa' })
    await warning.first().waitFor({ timeout: 5000 })
    await checkOverflow(page, state, 'Idag med varningen')

    // Logga – det syns i appen men den trasiga dagboken skrivs inte över.
    await quickAdd(page, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
    await closeAdd(page)
    await nav(page, 'Dagbok')
    check((await diaryMealEntries(page, 'Lunch')).length === 1, 'posten syns inte i dagboken (minnesläget)')
    await page.getByRole('region', { name: 'Vatten' }).getByRole('button', { name: 'Lägg till ett glas (250 ml)' }).click()
    await page.waitForTimeout(800)
    const idb = await readIdb(page)
    check(idb['lagom-diary'] === corrupt, `den trasiga dagboken skrevs över: ${String(idb['lagom-diary']).slice(0, 120)}`)
    check(!Object.keys(idb).some((k) => k.startsWith('lagom-diary:') || k === 'lagom-diary-v1'), `nya dagboksnycklar skapades: ${Object.keys(idb).join(', ')}`)
    // Felloggen: ett fast meddelande, aldrig innehållet.
    const log = String((await readLocalStorage(page))['lagom-error-log'] ?? '')
    check(!log.includes('not json'), 'felloggen citerar den sparade dagbokens innehåll')
    check(log.includes('Dagbokens sparade värde går inte att tolka'), 'felloggen saknar det fasta meddelandet om den trasiga dagboken')

    // Omladdning: varningen står kvar och den trasiga dagboken är orörd.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await warning.first().waitFor({ timeout: 5000 })
    check((await readIdb(page))['lagom-diary'] === corrupt, 'den trasiga dagboken ändrades vid omladdningen')

    // Radera all data tar bort den.
    await wipeAllViaSettings(page)
    await waitFor(async () => (await readIdb(page))['lagom-diary'] !== corrupt, { message: 'Radera all data tog inte bort den trasiga dagboken' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    check(currentPath(page) === '/valkommen', `efter radering visas ${currentPath(page)} i stället för välkomstflödet`)
    check((await page.getByText('Den sparade dagboken gick inte att läsa').count()) === 0, 'varningen visas fortfarande efter Radera all data')
    const d = diaryFromIdb(await readIdb(page))
    check(allEntries(d).length === 0, 'dagboken är inte tom efter radering')
  },
}

export const JOURNEYS = [valkomst, loggaOchAngra, vattenOchSteg, anteckning, sakerhetskopia, manadsformat, tvaFlikar, offline, trasigDagbok]

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 26).join('\n'))
    return
  }
  await runJourneys(JOURNEYS, args)
}

// Kör bara när filen startas direkt.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err)
    process.exitCode = 1
  })
}
