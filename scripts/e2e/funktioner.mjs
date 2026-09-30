#!/usr/bin/env node
/**
 * Lagoms funktionsresor från början till slut i den byggda appen (riktig Chromium, riktig IndexedDB,
 * riktiga omladdningar) – samma grund som kärnresorna (scripts/e2e/lib.mjs):
 *
 *   node scripts/e2e/funktioner.mjs --dist=<webbygget> [--appstore=<mapp>] [--play=<mapp>] [--only=<resa>[,<resa>]] [--headed] [--list]
 *
 * Utan att röra dist/ eller dist-native/ (t.ex. när andra bygger samtidigt):
 *   npx vite build --outDir /tmp/e2e-funktioner/web
 *   VITE_DISTRIBUTION=appstore VITE_API_BASE=https://lagom.invalid VITE_SELLER_NAME=Testbygge VITE_SELLER_ADDRESS="Testgatan 1" \
 *     VITE_SELLER_PHONE=000 VITE_SUPPORT_EMAIL=ci@users.noreply.github.com LAGOM_ALLOW_STORE_WITHOUT_IAP=1 \
 *     npx vite build --outDir /tmp/e2e-funktioner/appstore        (och likadant med play → /tmp/e2e-funktioner/play)
 *   node scripts/e2e/funktioner.mjs --dist=/tmp/e2e-funktioner/web
 *
 * `--appstore` och `--play` är butiksbyggena (standard /tmp/e2e-funktioner/appstore och …/play) och
 * används bara av resan butiksbyggen. Resorna (PASS/FAIL, slutkod 1 vid fel, skärmdump i
 * /tmp/lagom-e2e/<resa>.png):
 *   dela-recept          eget recept med två ingredienser → länk → ny kontext med egen profil → förhandsvisning → spara → samma näring
 *   etikett              ?etikett=1 → klistra in en svensk näringsdeklaration → formuläret fylls i → spara → sök → logga
 *   allergier            allergiprofil (mjölk + gluten) → streckkod (Open Food Facts-fixtur) flaggar mjölk med källan → kurerat: inga uppgifter
 *   veckobudget          Fredagsmys (fast klocka måndag/fredag): fredagens mål är högre än måndagens; medvetet läge döljer siffrorna
 *   milstolpar           första måltiden firas en gång, inte igen efter omladdning, och står på /mer/milstolpar
 *   framstegsbilder      slå på → välj en JPEG (med EXIF/GPS) → syns utan EXIF → radera → borta; aldrig på Idag
 *   exempeldata          utforska exemplet → sidorna har data → loggning visar exempelarket och ändrar ingenting
 *   provperioden-slut    provperioden slut → skrivskyddat (se, exportera), loggning visar köparket, inget raderas
 *   butiksbyggen         App Store- och Play-byggena: välkomstflödet, inga kronpriser/Stripe, ingen nyckel i App Store, Återställ köp
 *   tillganglighet-snabb Idag, Dagbok, Lägg till och Inställningar: namn, landmärken, rubriker; tabb genom arket i Lägg till
 *
 * Konsolfel, sidfel, vågrät scroll vid 390 px, fokusfällor och appens fellogg samlas per resa (se lib.mjs).
 * Externa värdar nås aldrig: Open Food Facts besvaras med en fixtur (`answerExternal`).
 * Filen slutar inte på .test.* – den körs aldrig av vitest eller CI.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  allEntries,
  answerExternal,
  BLANK_PATH,
  check,
  checkFocusFlow,
  checkOverflow,
  currentPath,
  diaryFromIdb,
  JourneyFailure,
  navigateAndWait,
  newAppContext,
  note,
  onboard,
  openApp,
  parseArgs,
  readIdb,
  runJourneys,
  SHOT_DIR,
  startServer,
  todayStockholm,
  waitFor,
  waitForApp,
  waitForHash,
  writeIdb,
} from './lib.mjs'

// ---------------------------------------------------------------------------
// Egna argument (lib.mjs:s parseArgs känner inte till butiksbyggena)
// ---------------------------------------------------------------------------

const STORE_DIRS = { appstore: '/tmp/e2e-funktioner/appstore', play: '/tmp/e2e-funktioner/play' }

function splitArgs(argv) {
  const rest = []
  for (const a of argv) {
    if (a.startsWith('--appstore=')) STORE_DIRS.appstore = resolve(a.slice(11))
    else if (a.startsWith('--play=')) STORE_DIRS.play = resolve(a.slice(7))
    else rest.push(a)
  }
  return rest
}

// ---------------------------------------------------------------------------
// Hjälpare (samma mönster som karna.mjs – den exporterar inte sina hjälpare)
// ---------------------------------------------------------------------------

const MAIN_NAV = 'Huvudmeny'
const DAY_MS = 86_400_000

/** Klicka på en länk i huvudmenyn (Idag, Dagbok, Insikter, Mer). */
async function nav(page, name) {
  await navigateAndWait(page, () => page.getByRole('navigation', { name: MAIN_NAV }).getByRole('link', { name, exact: true }).click())
}

/** Byt sida inne i appen via adressen (hash-routern) och vänta tills den visas. */
async function openHash(page, hash) {
  const path = hash.replace(/^#/, '').split('?')[0]
  const go = () =>
    page.evaluate((h) => {
      location.hash = h
    }, hash)
  // En annan sida (första ledet byts): vänta på den nya sidans rubrik. Inom samma sida (t.ex. en
  // annan dag i dagboken) finns rubriken redan.
  if (path.split('/')[1] !== currentPath(page).split('/')[1]) await navigateAndWait(page, go)
  else await go()
  await waitForHash(page, path)
  await waitForApp(page)
}

async function idbDiary(page) {
  return diaryFromIdb(await readIdb(page))
}

/** JSON-värdet för en nyckel i IndexedDB (zustand: { state, version }), eller null. */
async function idbJson(page, key) {
  const raw = (await readIdb(page))[key]
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Snabbvägen på sökraden i Lägg till: "Lägg till <livsmedel> direkt". */
async function quickAdd(page, { meal = 'lunch', query = 'kyckling', food = 'Kycklingbröst' } = {}) {
  await page.getByRole('link', { name: `Lägg till i ${meal}` }).first().click()
  await waitForHash(page, '/lagg-till')
  await page.getByLabel('Sök livsmedel').fill(query)
  await page.getByRole('button', { name: new RegExp(`^Lägg till ${escapeRe(food)} direkt`) }).click()
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
    const m = /^Ändra (.+?), .*?(\d[\d\s ]*) kcal$/.exec(l)
    return { name: m?.[1] ?? l, kcal: m ? Number(m[2].replace(/\s| /g, '')) : null, label: l }
  })
}

/** Vänta på en text (t.ex. i en toast) och returnera platsen. */
async function textShown(page, text, timeout = 8000) {
  const t = page.getByText(text, { exact: false }).first()
  await t.waitFor({ timeout })
  return t
}

/** En lista ur en butik som sparar antingen en array eller ett objekt per id. */
const listOf = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "1 750" / "1 750 kcal" → 1750. */
const num = (s) => Number(String(s).replace(/[^\d,.-]/g, '').replace(',', '.'))

/** Synlig text i ett element, med hårda mellanslag som vanliga. */
async function textOf(locator) {
  return ((await locator.innerText()) ?? '').replace(/[  ]/g, ' ')
}

/**
 * Ord som Lagom aldrig får använda om allergener utan märkning (CLAUDE.md: "säker", "fri från",
 * "innehåller inte"). Bokstavsgränser med \p{L} – \b fungerar inte med å/ä/ö.
 */
const FORBIDDEN_ALLERGEN_WORDS = [/(?<!\p{L})säker(t|a)?(?!\p{L})/iu, /(?<!\p{L})fri(tt|a)? från(?!\p{L})/iu, /(?<!\p{L})innehåller (inte|ingen|inget|inga)(?!\p{L})/iu]

function forbiddenWords(text) {
  return FORBIDDEN_ALLERGEN_WORDS.map((re) => re.exec(text)?.[0]).filter(Boolean)
}

/** En giltig EAN-13 med kontrollsiffra för de tolv första siffrorna. */
function ean13(first12) {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return `${first12}${(10 - (sum % 10)) % 10}`
}

/** Dagsringens aria-label ("Dagsringen: 1 234 kcal kvar av 1 750 kcal. …") på Idag. */
async function ringLabel(page) {
  const ring = page.getByRole('region', { name: 'Dagsringen' }).getByRole('img', { name: /^Dagsringen/ })
  await ring.waitFor({ timeout: 8000 })
  return ((await ring.getAttribute('aria-label')) ?? '').replace(/[  ]/g, ' ')
}

/** Målet ur dagsringen ("… av 1 750 kcal" / "budgeten på 1 750 kcal"). */
function ringTotal(label) {
  const m = /(?:av|budgeten på) ([\d ]+) kcal/.exec(label)
  return m ? num(m[1]) : null
}

/** Skapa ett eget livsmedel via formuläret (/nytt-livsmedel): namn, energi i kcal, makron och märkningar. */
async function createCustomFood(page, { name, kcal, fat, carbs, protein, tags = [] }) {
  await openHash(page, '#/nytt-livsmedel')
  await page.getByRole('textbox', { name: 'Namn', exact: true }).fill(name)
  await page.getByRole('spinbutton', { name: 'Energi', exact: true }).fill(String(kcal))
  await page.getByRole('spinbutton', { name: 'Fett', exact: true }).fill(String(fat))
  await page.getByRole('spinbutton', { name: 'Kolhydrat', exact: true }).fill(String(carbs))
  await page.getByRole('spinbutton', { name: 'Protein', exact: true }).fill(String(protein))
  const group = page.getByRole('group', { name: 'Egenskaper' })
  for (const t of tags) await group.getByRole('button', { name: t, exact: true }).click()
  await page.getByRole('button', { name: 'Spara livsmedlet' }).click()
  await textShown(page, 'Sparat bland dina livsmedel')
  await waitFor(() => currentPath(page).startsWith('/livsmedel/'), { message: `efter Spara visas ${currentPath(page)}` })
  await waitForApp(page)
}

/** Räkna notiserna "Ny milstolpe …" på sidan (toasten kan hinna försvinna mellan två kontroller). */
async function countMilestoneToasts(page) {
  await page.addInitScript(() => {
    window.__milstolpar = []
    new MutationObserver(() => {
      // Notisernas text står i ett <span> i en aria-live-yta (components/ui/toast.tsx).
      for (const el of document.querySelectorAll('[aria-live] span, [role="alert"] span, [role="status"] span')) {
        const t = el.childElementCount === 0 ? el.textContent ?? '' : ''
        if (t.startsWith('Ny milstolpe') && !el.__sett) {
          el.__sett = true
          window.__milstolpar.push(t)
        }
      }
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
}

const milestoneToasts = (page) => page.evaluate(() => window.__milstolpar ?? [])

/** Radera all data via Inställningar → Data (båda bekräftelserna) och vänta tills det har nått IndexedDB. */
async function wipeAllViaSettings(page) {
  await openHash(page, '#/installningar/data')
  await page.getByRole('main').getByRole('button', { name: 'Radera all data' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Radera all data?' }).or(page.getByRole('dialog', { name: 'Radera all data?' }))
  await confirm.waitFor()
  await confirm.getByRole('button', { name: 'Fortsätt' }).click()
  const last = page.getByRole('alertdialog', { name: 'Sista steget' })
  await last.waitFor()
  await last.getByLabel('Skriv RADERA').fill('RADERA')
  await last.getByRole('button', { name: 'Radera allt' }).click()
  await waitForHash(page, '/valkommen')
  await waitFor(async () => {
    const raw = (await readIdb(page))['lagom-profile']
    return typeof raw === 'string' && !raw.includes('"onboardingDone":true')
  }, { message: 'Radera all data nådde aldrig IndexedDB (profilen finns kvar)' })
}

// ---------------------------------------------------------------------------
// 1. Dela recept
// ---------------------------------------------------------------------------

const RECIPE_NAME = 'Testgröt med müsli'
const OWN_FOOD = 'Hemgjord müsli'

/** "Näring"-kortet och faktarutan på receptsidan som text – för att jämföra två recept. */
async function recipeNutrition(page) {
  // Routern visar den gamla sidan (redigeraren) tills receptsidans koddel är hämtad – vänta på
  // receptsidans egna delar: faktarutan "Per portion" och kortet "Näring".
  await page.waitForFunction(
    () => {
      const main = document.querySelector('main')
      if (!main) return false
      const dt = [...main.querySelectorAll('dt')].some((d) => (d.textContent ?? '').trim().startsWith('Per '))
      const h = [...main.querySelectorAll('h2, h3')].some((x) => (x.textContent ?? '').trim() === 'Näring')
      return dt && h
    },
    null,
    { timeout: 10000 },
  )
  return page.evaluate(() => {
    const clean = (s) => (s ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim()
    const main = document.querySelector('main')
    // Faktarutan: "Per portion" (dt) och värdet (dd).
    let perServing = null
    for (const dt of main.querySelectorAll('dt')) {
      if (clean(dt.textContent).startsWith('Per ')) perServing = clean(dt.parentElement?.querySelector('dd')?.textContent)
    }
    const heading = [...main.querySelectorAll('h2, h3')].find((h) => clean(h.textContent) === 'Näring')
    let card = heading
    while (card && !card.classList.contains('card')) card = card.parentElement
    return { perServing, card: clean(card?.innerText ?? '') }
  })
}

/** Lägg till en ingrediens i receptredigeraren: sök → träffen → "Lägg till i receptet". */
async function addIngredient(page, query, food) {
  const search = page.getByRole('searchbox', { name: 'Lägg till ingrediens' }).or(page.getByLabel('Lägg till ingrediens'))
  await search.first().fill(query)
  const hit = page.getByRole('list', { name: 'Sökträffar' }).getByRole('button', { name: new RegExp(`^${escapeRe(food)}(\\s|$)`) }).first()
  await hit.waitFor({ timeout: 8000 })
  await hit.click()
  const sheet = page.getByRole('dialog', { name: food })
  await sheet.waitFor()
  await sheet.getByRole('button', { name: 'Lägg till i receptet' }).click()
  await sheet.waitFor({ state: 'hidden' })
}

const delaRecept = {
  name: 'dela-recept',
  title: 'Eget recept → delningslänk → ny kontext med egen profil → förhandsvisning → spara → samma näring',
  async run({ state, newPage }) {
    const clipboard = { contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } }
    const page = await newPage(clipboard)
    await openApp(page, state, '#/')
    await onboard(page, state, { name: 'Avsändare' })

    // Ett eget livsmedel (bäddas in i länken) märkt vegansk och glutenfri – märkningarna glutenfri,
    // laktosfri och vegansk får aldrig följa med (vegansk blir vegetarisk).
    await createCustomFood(page, { name: OWN_FOOD, kcal: 420, fat: 14, carbs: 58, protein: 11, tags: ['Vegansk', 'Glutenfri'] })

    // Nytt recept med två ingredienser: ett kurerat (delas som hänvisning) och det egna (inbäddat).
    await openHash(page, '#/recept/nytt')
    await checkOverflow(page, state, 'Nytt recept')
    await page.getByRole('textbox', { name: 'Namn' }).fill(RECIPE_NAME)
    await addIngredient(page, 'havregryn', 'Havregryn')
    await addIngredient(page, 'hemgjord', OWN_FOOD)
    const ingredients = page.getByRole('list', { name: 'Ingredienser i receptet' }).getByRole('listitem')
    check((await ingredients.count()) === 2, `receptet har ${await ingredients.count()} ingredienser i stället för 2`)
    await page.getByRole('main').getByRole('button', { name: 'Spara', exact: true }).first().click()
    await textShown(page, 'Receptet är sparat')
    await waitFor(() => currentPath(page).startsWith('/recept/r_'), { message: `efter Spara visas ${currentPath(page)} i stället för receptet` })
    await waitForApp(page)
    const original = await recipeNutrition(page)
    note(state, `originalet: per portion ${original.perServing}`)
    check(original.perServing && /\d/.test(original.perServing), `receptsidan visar ingen energi per portion: ${JSON.stringify(original)}`)

    // Dela → Kopiera länk (urklipp med behörighet i kontexten).
    await page.getByRole('button', { name: `Dela receptet ${RECIPE_NAME}` }).click()
    const sheet = page.getByRole('dialog', { name: 'Dela receptet' })
    await sheet.waitFor()
    await checkOverflow(page, state, 'Dela receptet')
    const copy = sheet.getByRole('button', { name: 'Kopiera länk' })
    await waitFor(() => copy.isEnabled(), { message: 'knappen Kopiera länk blev aldrig klickbar (länken skapades inte)' })
    await copy.click()
    await textShown(page, 'Länken är kopierad')
    const link = await page.evaluate(() => navigator.clipboard.readText())
    note(state, `länken: ${link.slice(0, 80)}… (${link.length} tecken)`)
    check(link.startsWith(`${state.base}/#/dela?d=`), `länken börjar inte med ${state.base}/#/dela?d=: ${link.slice(0, 120)}`)
    check(!link.includes('Avsändare'), 'länken innehåller avsändarens namn')
    // Samma recept som fil ("Dela som fil" → <namn>.lagom.json).
    await page.getByRole('button', { name: `Dela receptet ${RECIPE_NAME}` }).click()
    await sheet.waitFor()
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), sheet.getByRole('button', { name: 'Dela som fil' }).click()])
    const sharedFile = join(SHOT_DIR, 'dela-recept.lagom.json')
    await download.saveAs(sharedFile)
    check(download.suggestedFilename() === `${RECIPE_NAME}.lagom.json`, `filnamnet är "${download.suggestedFilename()}"`)
    const fileJson = JSON.parse(readFileSync(sharedFile, 'utf8'))
    check(fileJson.v === 1 && fileJson.kind === 'recipe' && fileJson.name === RECIPE_NAME, `filens innehåll: ${JSON.stringify(fileJson).slice(0, 200)}`)
    const fileText = JSON.stringify(fileJson)
    check(!/glutenfri|laktosfri|vegan|allergen|Avsändare/i.test(fileText), `filen innehåller märkningar, allergener eller profilen: ${fileText.slice(0, 300)}`)
    await textShown(page, 'Filen är sparad')

    // Mottagaren: en ny kontext med en egen profil.
    const other = await newPage({ fresh: true })
    await openApp(other, state, '#/')
    await onboard(other, state, { name: 'Mottagare', sex: 'Man', birthYear: '1979', height: '182', weight: '84' })
    await navigateAndWait(other, () => other.goto(link))
    await waitForHash(other, '/dela')
    await waitForApp(other)
    const preview = other.getByRole('region', { name: RECIPE_NAME })
    await preview.waitFor({ timeout: 8000 })
    await checkOverflow(other, state, 'förhandsvisningen /dela')
    const previewText = await textOf(other.getByRole('main'))
    check(/Havregryn/.test(previewText) && previewText.includes(OWN_FOOD), 'förhandsvisningen visar inte båda ingredienserna')
    check(/Näring per portion/.test(previewText), 'förhandsvisningen saknar "Näring per portion"')
    const kcalPerServing = /(\d[\d ]*) kcal/.exec(original.perServing ?? '')?.[1]
    check(kcalPerServing && previewText.includes(`${kcalPerServing} kcal`), `förhandsvisningen visar inte ${kcalPerServing} kcal per portion`)
    // Inget sparas förrän man väljer det.
    const before = await idbJson(other, 'lagom-food')
    check(!JSON.stringify(before ?? {}).includes(RECIPE_NAME), 'receptet sparades redan innan man valde Spara recept')

    await other.getByRole('button', { name: 'Spara recept' }).click()
    await textShown(other, `”${RECIPE_NAME}” är sparat i Mina recept`)
    await waitFor(() => currentPath(other).startsWith('/recept/r_'), { message: `efter Spara recept visas ${currentPath(other)}` })
    await waitForApp(other)
    const imported = await recipeNutrition(other)
    check(imported.perServing === original.perServing, `energi per portion skiljer sig: original "${original.perServing}", importerat "${imported.perServing}"`)
    check(imported.card === original.card, `Näring-kortet skiljer sig:\n      original:   ${original.card}\n      importerat: ${imported.card}`)

    // Receptlistan (Mina recept) och IndexedDB – även efter omladdning.
    await other.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(other)
    await openHash(other, '#/recept')
    await other.getByRole('main').getByRole('link', { name: new RegExp(escapeRe(RECIPE_NAME)) }).first().waitFor({ timeout: 8000 })
    const foods = await idbJson(other, 'lagom-food')
    const recipes = listOf(foods?.state?.recipes)
    check(recipes.filter((r) => r.name === RECIPE_NAME).length === 1, `IndexedDB har ${recipes.filter((r) => r.name === RECIPE_NAME).length} recept med namnet (väntat 1)`)
    // Det inbäddade livsmedlet: ett eget livsmedel utan glutenfri/laktosfri/vegansk (vegansk → vegetarisk).
    const own = listOf(foods?.state?.customFoods).filter((f) => f.name === OWN_FOOD)
    check(own.length === 1, `mottagaren har ${own.length} egna livsmedel "${OWN_FOOD}" (väntat 1)`)
    const tags = own[0].tags ?? []
    check(!tags.some((t) => ['glutenfri', 'laktosfri', 'vegan'].includes(t)), `märkningar följde med i delningen: ${JSON.stringify(tags)}`)
    check(tags.includes('vegetarisk'), `vegansk blev inte vegetarisk hos mottagaren: ${JSON.stringify(tags)}`)
    check(!own[0].extra?.allergenKeys && !own[0].extra?.allergens, `allergenuppgifter följde med: ${JSON.stringify(own[0].extra)}`)
    check(Math.abs((own[0].nutrients?.kcal ?? 0) - 420) < 1 && own[0].nutrients?.protein === 11, `näringen för det inbäddade livsmedlet: ${JSON.stringify(own[0].nutrients)}`)

    // Samma länk en gång till: livsmedlet återanvänds (inga dubbletter).
    await navigateAndWait(other, () => other.goto(link))
    await other.getByRole('region', { name: RECIPE_NAME }).waitFor({ timeout: 8000 })
    await other.getByRole('button', { name: 'Spara recept' }).click()
    await waitFor(() => currentPath(other).startsWith('/recept/r_'), { message: `andra importen: visas ${currentPath(other)}` })
    const again = await waitFor(async () => {
      const f = await idbJson(other, 'lagom-food')
      return listOf(f?.state?.recipes).filter((r) => r.name === RECIPE_NAME).length === 2 ? f : null
    }, { message: 'andra importen sparades inte' })
    const ownAgain = listOf(again.state.customFoods).filter((f) => f.name === OWN_FOOD)
    check(ownAgain.length === 1, `efter andra importen finns ${ownAgain.length} egna livsmedel "${OWN_FOOD}" (dubbletter)`)
    note(state, 'andra importen: receptet sparades en gång till, det egna livsmedlet återanvändes')

    // Länken öppnad innan någon profil finns: välkomstflödet först, sedan förhandsvisningen.
    const fresh = await newPage({ fresh: true })
    await fresh.goto(link, { waitUntil: 'domcontentloaded' })
    await waitForApp(fresh)
    check(currentPath(fresh) === '/valkommen', `utan profil borde länken leda till välkomstflödet, visar ${currentPath(fresh)}`)
    await onboard(fresh, state, { name: 'Ny', landing: '/dela' }).catch((e) => {
      throw new JourneyFailure(`efter välkomstflödet öppnades inte den delade länken (visar ${currentPath(fresh)}): ${e.message.split('\n')[0]}`)
    })
    await fresh.getByRole('region', { name: RECIPE_NAME }).waitFor({ timeout: 8000 })
    note(state, 'länken som öppnades före profilen visades efter välkomstflödet')

    // Öppna delat → Välj fil (filen från "Dela som fil") → förhandsvisning → spara.
    await openHash(fresh, '#/recept')
    await openHash(fresh, '#/dela')
    const [fileChooser] = await Promise.all([fresh.waitForEvent('filechooser', { timeout: 8000 }), fresh.getByRole('button', { name: 'Välj fil' }).click()])
    await fileChooser.setFiles(sharedFile)
    await fresh.getByRole('region', { name: RECIPE_NAME }).waitFor({ timeout: 8000 })
    await fresh.getByRole('button', { name: 'Spara recept' }).click()
    await waitFor(() => currentPath(fresh).startsWith('/recept/r_'), { message: `efter Spara recept (fil) visas ${currentPath(fresh)}` })
    await waitForApp(fresh)
    const fromFile = await recipeNutrition(fresh)
    check(fromFile.card === original.card, `receptet från filen har annan näring:\n      original: ${original.card}\n      filen:    ${fromFile.card}`)
    // Öppna delat → klistra in länken som text.
    await openHash(fresh, '#/recept')
    await openHash(fresh, '#/dela')
    await fresh.getByRole('textbox', { name: 'Länk' }).fill(`Titta här: ${link} `)
    await fresh.getByRole('button', { name: 'Öppna länken' }).click()
    await fresh.getByRole('region', { name: RECIPE_NAME }).waitFor({ timeout: 8000 })
    note(state, 'filen och den inklistrade länken gav samma förhandsvisning')
  },
}

// ---------------------------------------------------------------------------
// 2. Etikett
// ---------------------------------------------------------------------------

const LABEL_TEXT = `Näringsvärde per 100 g
Energi 1600 kJ / 380 kcal
Fett 12 g
varav mättat fett 2 g
Kolhydrater 55 g
varav sockerarter 20 g
Fiber 6 g
Protein 9 g
Salt 0,8 g`

const etikett = {
  name: 'etikett',
  title: 'Fyll i från förpackningen (?etikett=1) → spara → hittas i sökningen → loggas',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    const today = todayStockholm()

    await openHash(page, '#/nytt-livsmedel?etikett=1')
    const panel = page.getByRole('region', { name: 'Fyll i från förpackningen' })
    await panel.waitFor()
    const text = panel.getByRole('textbox', { name: 'Näringsdeklarationen som text' })
    check(await text.isVisible(), 'panelen är inte öppen med ?etikett=1')
    await text.fill(LABEL_TEXT)
    await panel.getByRole('button', { name: 'Tolka' }).click()
    const found = panel.getByRole('definition').first()
    await found.waitFor({ timeout: 5000 })
    const summary = await textOf(panel)
    check(/Lagom hittade \d+ värden/.test(summary), `tolkningen hittade inga värden: ${summary.slice(0, 200)}`)
    note(state, `tolkningen: ${/Lagom hittade [^\n]+/.exec(summary)?.[0]}`)
    const warn = panel.getByRole('list', { name: 'Kontrollera' })
    if ((await warn.count()) > 0) note(state, `varningar vid tolkningen: ${await textOf(warn)}`)
    await checkOverflow(page, state, 'etikettpanelen med tolkningen')
    await panel.getByRole('button', { name: 'Fyll i formuläret' }).click()
    await textShown(page, 'Värdena är ifyllda – granska dem och spara.')

    // Formuläret: värdena per 100 g.
    const val = async (label) => (await page.getByRole('spinbutton', { name: label, exact: true }).inputValue()).replace(/[ \s]/g, '')
    const energyUnit = await page.getByRole('radiogroup', { name: 'Energienhet' }).getByRole('radio', { checked: true }).textContent()
    const energy = num(await val('Energi'))
    const expectedEnergy = energyUnit?.trim() === 'kJ' ? 1600 : 380
    check(energy === expectedEnergy, `Energi i formuläret är ${energy} ${energyUnit} (väntat ${expectedEnergy} ${energyUnit})`)
    const expected = { Fett: 12, 'varav mättat fett': 2, Kolhydrat: 55, 'varav sockerarter': 20, Fiber: 6, Protein: 9, Salt: 0.8 }
    const wrong = []
    for (const [label, want] of Object.entries(expected)) {
      const got = num(await val(label))
      if (Math.abs(got - want) > 1e-9) wrong.push(`${label}: ${got} (väntat ${want})`)
    }
    check(wrong.length === 0, `fel värden i formuläret: ${wrong.join(', ')}`)
    const basis = await page.getByRole('radiogroup', { name: 'Värdena gäller' }).getByRole('radio', { checked: true }).textContent()
    note(state, `formuläret: ${energy} ${energyUnit?.trim()}, värdena gäller "${basis?.trim()}"`)

    // Namnet skriver man själv – sedan Spara.
    await page.getByRole('textbox', { name: 'Namn', exact: true }).fill('Testkaka havre')
    await page.getByRole('button', { name: 'Spara livsmedlet' }).click()
    await textShown(page, 'Sparat bland dina livsmedel')
    await waitFor(() => currentPath(page).startsWith('/livsmedel/'), { message: `efter Spara visas ${currentPath(page)} i stället för livsmedlet` })
    await waitForApp(page)
    const foods = await idbJson(page, 'lagom-food')
    const custom = listOf(foods?.state?.customFoods).find((f) => f.name === 'Testkaka havre')
    check(custom, 'det egna livsmedlet finns inte i IndexedDB')
    const n = custom.nutrients ?? {}
    check(Math.abs((n.kcal ?? 0) - 380) <= 3 && n.fat === 12 && n.carbs === 55 && n.protein === 9 && n.fiber === 6 && n.salt === 0.8, `sparade näringsvärden per 100 g: ${JSON.stringify(n)}`)

    // Söks upp i Lägg till och loggas.
    await openHash(page, '#/')
    await page.getByRole('link', { name: 'Lägg till i lunch' }).first().click()
    await waitForHash(page, '/lagg-till')
    await page.getByLabel('Sök livsmedel').fill('testkaka')
    const row = page.getByRole('button', { name: /^Testkaka havre, .*Välj mängd/ })
    await row.waitFor({ timeout: 8000 })
    await row.click()
    const sheet = page.getByRole('dialog', { name: 'Testkaka havre' })
    await sheet.waitFor()
    await sheet.getByRole('button', { name: 'Lägg till i Lunch' }).click()
    await sheet.waitFor({ state: 'hidden' })
    await textShown(page, 'Tillagt i Lunch')
    await closeAdd(page)
    const diary = await waitFor(async () => {
      const d = await idbDiary(page)
      return allEntries(d).length === 1 ? d : null
    }, { message: 'posten sparades inte i IndexedDB' })
    const entry = diary.entries[today]?.[0]
    check(entry?.food?.name === 'Testkaka havre' && entry.meal === 'lunch', `fel post i dagboken: ${JSON.stringify(entry).slice(0, 200)}`)
    await nav(page, 'Dagbok')
    const lunch = await diaryMealEntries(page, 'Lunch')
    check(lunch.length === 1 && lunch[0].name === 'Testkaka havre' && lunch[0].kcal > 0, `dagboken visar: ${JSON.stringify(lunch)}`)
    note(state, `loggat: ${lunch[0].label}`)
  },
}

// ---------------------------------------------------------------------------
// 3. Allergier
// ---------------------------------------------------------------------------

const OFF_CODE = ean13('731000000123')
const OFF_PRODUCT = {
  code: OFF_CODE,
  product_name: 'Testchoklad mjölk',
  product_name_sv: 'Testchoklad mjölk',
  brands: 'Provbolaget',
  quantity: '100 g',
  serving_size: '25 g',
  serving_quantity: 25,
  nutriments: {
    'energy-kcal_100g': 540,
    'energy-kj_100g': 2260,
    fat_100g: 31,
    'saturated-fat_100g': 19,
    carbohydrates_100g: 57,
    sugars_100g: 56,
    fiber_100g: 2,
    proteins_100g: 7,
    salt_100g: 0.2,
  },
  nutriscore_grade: 'e',
  nova_group: 4,
  ingredients_text_sv: 'Socker, kakaosmör, helmjölkspulver, kakaomassa, emulgeringsmedel (sojalecitin), arom.',
  allergens_tags: ['en:milk', 'en:soybeans'],
  traces_tags: ['en:nuts'],
  labels_tags: [],
  categories_tags: ['en:snacks', 'en:sweet-snacks', 'en:chocolates', 'en:milk-chocolates'],
  countries_tags: ['en:sweden'],
}

const allergier = {
  name: 'allergier',
  title: 'Allergiprofil (mjölk + gluten) → streckkod flaggar mjölk med källan → kurerat livsmedel saknar uppgifter',
  async run({ state, newPage }) {
    const offCalls = []
    // Efter newPage(): kontexten skapar en ny lista med svar på externa anrop.
    const page = await newPage()
    answerExternal(state, (u) => /^https:\/\/[a-z]+\.openfoodfacts\.org\/cgi\/search\.pl\?/.test(u), (url) => {
      offCalls.push(url)
      return { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ count: 1, page: 1, page_size: 24, products: [OFF_PRODUCT] }) }
    })
    answerExternal(state, (u) => /^https:\/\/[a-z]+\.openfoodfacts\.org\/api\/v2\/product\//.test(u), (url) => {
      offCalls.push(url)
      const code = /product\/(\d+)\.json/.exec(url)?.[1]
      if (code !== OFF_CODE) return { status: 404, contentType: 'application/json', body: JSON.stringify({ status: 0, status_verbose: 'product not found' }) }
      return { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: OFF_CODE, status: 1, status_verbose: 'product found', product: OFF_PRODUCT }) }
    })
    await openApp(page, state, '#/')
    await onboard(page, state)

    // Inställningar → Allergier och överkänslighet.
    await nav(page, 'Mer')
    await navigateAndWait(page, () => page.getByRole('link', { name: /^Inställningar/ }).click())
    await navigateAndWait(page, () => page.getByRole('link', { name: /^Allergier och överkänslighet/ }).click())
    await waitForHash(page, '/installningar/allergier')
    await checkOverflow(page, state, 'Allergier och överkänslighet')
    await page.getByRole('checkbox', { name: 'Mjölk och mjölkprodukter' }).check()
    await page.getByRole('checkbox', { name: 'Spannmål som innehåller gluten' }).check()
    await textShown(page, 'Du har markerat gluten och mjölk.')
    const profile = await waitFor(async () => {
      const p = await idbJson(page, 'lagom-profile')
      const a = p?.state?.settings?.allergens ?? []
      return a.includes('mjolk') && a.length === 2 ? p : null
    }, { message: 'allergiprofilen sparades inte i IndexedDB' })
    note(state, `sparad profil: ${JSON.stringify(profile.state.settings.allergens)}`)

    await openHash(page, '#/')
    await page.getByRole('link', { name: 'Lägg till i lunch' }).first().click()
    await waitForHash(page, '/lagg-till')
    // Skanna: ingen kamera i huvudlös Chromium – skriv in koden.
    await openHash(page, '#/skanna?maltid=lunch')
    // Utan kamera visas fältet direkt (Ingen kamera hittades) – medan kameran startar finns
    // knappen "Skriv in kod", som byts mot fältet när kameran inte hittas.
    const codeField = page.getByRole('textbox', { name: 'Streckkod (EAN)' })
    const manual = page.getByRole('button', { name: 'Skriv in kod' })
    await waitFor(async () => {
      if (await codeField.isVisible()) return true
      if (await manual.isVisible()) await manual.click({ timeout: 1000 }).catch(() => {})
      return false
    }, { timeout: 10000, message: 'fältet Streckkod (EAN) visas aldrig på skanningssidan' })
    note(state, `skanningssidan: ${(await page.getByRole('heading', { level: 2 }).first().textContent().catch(() => '')) || 'kameravyn'}`)
    await codeField.fill(OFF_CODE)
    await page.getByRole('button', { name: 'Sök produkten' }).click()
    const sheet = page.getByRole('dialog', { name: 'Testchoklad mjölk' })
    await sheet.waitFor({ timeout: 10000 })
    const productCalls = offCalls.filter((u) => u.includes('/api/v2/product/'))
    check(productCalls.length === 1 && productCalls[0].includes(`/api/v2/product/${OFF_CODE}.json`), `streckkodsuppslagen till Open Food Facts: ${productCalls.join(', ') || 'inga'}`)
    const flags = sheet.getByRole('region', { name: 'Allergier och överkänslighet' })
    await flags.waitFor({ timeout: 5000 })
    const flagText = await textOf(flags)
    note(state, `flaggorna i skanningens ark: ${flagText.replace(/\n+/g, ' | ')}`)
    check(/Innehåller mjölk – som du har markerat/.test(flagText), `arket flaggar inte mjölk: ${flagText}`)
    check(/Open Food Facts/.test(flagText), `flaggorna saknar källan Open Food Facts: ${flagText}`)
    check(!/soja/i.test(flagText) && !/nötter/i.test(flagText), `arket flaggar något som inte är markerat: ${flagText}`)
    const sheetBad = forbiddenWords(await textOf(sheet))
    check(sheetBad.length === 0, `skanningens ark använder förbjudna ord: ${sheetBad.join(', ')}`)
    await checkOverflow(page, state, 'skanningens produktark')

    // Produktens egen sida (sparad i cachen vid skanningen).
    await sheet.getByRole('button', { name: 'Stäng' }).first().click().catch(() => page.keyboard.press('Escape'))
    await sheet.waitFor({ state: 'hidden' })
    await openHash(page, `#/livsmedel/${encodeURIComponent(`off:${OFF_CODE}`)}`)
    const detailFlags = page.getByRole('main').getByRole('region', { name: 'Allergier och överkänslighet' })
    await detailFlags.waitFor({ timeout: 8000 })
    const detailText = await textOf(detailFlags)
    check(/Innehåller mjölk – som du har markerat/.test(detailText) && /Open Food Facts/.test(detailText), `produktsidan flaggar inte mjölk med källan: ${detailText}`)
    check(await detailFlags.getByRole('link', { name: 'Ändra dina allergier' }).isVisible(), 'produktsidan saknar länken Ändra dina allergier')
    const detailBad = forbiddenWords(await textOf(page.getByRole('main')))
    check(detailBad.length === 0, `produktsidan använder förbjudna ord: ${detailBad.join(', ')}`)

    // Sök i Open Food Facts (online): raden får den varsamma flaggan.
    await openHash(page, '#/lagg-till?maltid=lunch')
    await page.getByLabel('Sök livsmedel').fill('testchoklad')
    await page.getByRole('button', { name: 'Sök i Open Food Facts (online)' }).click()
    const rowFlags = page.getByRole('list', { name: 'Allergier: Testchoklad mjölk' })
    await rowFlags.waitFor({ timeout: 8000 })
    const rowText = await textOf(rowFlags)
    check(/Innehåller mjölk – som du har markerat/.test(rowText) && !/soja|nötter/i.test(rowText), `sökraden: ${rowText}`)
    const onlineBad = forbiddenWords(await textOf(page.getByRole('main')))
    check(onlineBad.length === 0, `sökningen online använder förbjudna ord: ${onlineBad.join(', ')}`)

    // Ett kurerat livsmedel: inga uppgifter om allergener, och märkena Glutenfri/Laktosfri döljs.
    await openHash(page, `#/livsmedel/${encodeURIComponent('lagom:kycklingfile-stekt')}`)
    const curated = page.getByRole('main').getByRole('region', { name: 'Allergier och överkänslighet' })
    await curated.waitFor({ timeout: 8000 })
    const curatedText = await textOf(curated)
    check(curatedText.includes('Lagom har inga uppgifter om allergener för det här livsmedlet – läs alltid förpackningen och ingredienserna.'), `kurerat livsmedel: ${curatedText}`)
    const mainText = await textOf(page.getByRole('main'))
    const curatedBad = forbiddenWords(mainText)
    check(curatedBad.length === 0, `kurerat livsmedel använder förbjudna ord: ${curatedBad.join(', ')}`)
    // Allergiprofilen är hälsouppgifter och skickas aldrig till Open Food Facts.
    const leaked = offCalls.filter((u) => /mjolk|mjölk|gluten|allerg/i.test(decodeURIComponent(u).replace(/allergens_tags|traces_tags/g, '')))
    check(leaked.length === 0, `allergiprofilen följer med anropet till Open Food Facts: ${leaked.join(', ')}`)
    note(state, `anrop till Open Food Facts: ${offCalls.map((u) => new URL(u).pathname).join(', ')}`)
    const badges = mainText.split('\n').filter((l) => /^(Glutenfri|Laktosfri)$/.test(l.trim()))
    check(badges.length === 0, `märkena ${badges.join(', ')} visas trots allergiprofilen (Kycklingbröst har taggarna glutenfri och laktosfri)`)
  },
}

// ---------------------------------------------------------------------------
// 4. Veckobudget
// ---------------------------------------------------------------------------

/** Måndag och fredag samma vecka, mitt på dagen i Stockholm (efter dagens datum, så att `since` gäller). */
const MONDAY = new Date('2026-10-05T10:00:00+02:00')
const FRIDAY = new Date('2026-10-09T10:00:00+02:00')

/** Tabellen "Dagsmål per veckodag med veckobudgeten" i Inställningar → Mål och makron. */
async function weekTable(page) {
  return page.evaluate(() => {
    const caption = [...document.querySelectorAll('caption')].find((c) => /Dagsmål per veckodag/.test(c.textContent ?? ''))
    if (!caption) return null
    const rows = {}
    for (const tr of caption.closest('table').querySelectorAll('tbody tr')) {
      const cells = [...tr.querySelectorAll('th, td')].map((c) => (c.textContent ?? '').replace(/[  ]/g, ' ').trim())
      rows[cells[0]] = cells.slice(1)
    }
    return rows
  })
}

/** Budgeten i dagbokens "Dagens summering" (aria-valuetext "0 kcal av 2 110 kcal"). */
async function dayBudget(page) {
  const bar = page.getByRole('region', { name: 'Dagens summering' }).locator('[aria-label="Energi mot dagens budget"]')
  await bar.waitFor({ timeout: 5000 })
  const t = ((await bar.getAttribute('aria-valuetext')) ?? '').replace(/[\u00a0\u202f]/g, ' ')
  const m = / av ([\d ]+) kcal/.exec(t)
  return m ? num(m[1]) : null
}

const veckobudget = {
  name: 'veckobudget',
  title: 'Veckobudget Fredagsmys: fredagens mål högre än måndagens; medvetet läge döljer siffrorna',
  async run({ state, newPage }) {
    const page = await newPage()
    await page.clock.setFixedTime(MONDAY)
    await openApp(page, state, '#/')
    await onboard(page, state)
    const base = ringTotal(await ringLabel(page))
    check(base !== null && base > 1000, `dagsmålet före veckobudgeten gick inte att läsa: ${await ringLabel(page)}`)

    // Inställningar → Mål och makron → Veckobudget på (förvalet Fredagsmys).
    await openHash(page, '#/installningar/mal')
    const sw = page.getByRole('switch', { name: 'Veckobudget' })
    await sw.scrollIntoViewIfNeeded()
    await sw.click()
    check((await sw.getAttribute('aria-checked')) === 'true', 'reglaget Veckobudget slogs inte på')
    const preset = page.getByRole('radiogroup', { name: 'Fördelning', exact: true }).getByRole('radio', { checked: true })
    check(((await preset.textContent()) ?? '').trim() === 'Fredagsmys', `förvalet är "${await preset.textContent()}" i stället för Fredagsmys`)
    const table = await waitFor(() => weekTable(page), { message: 'tabellen med dagsmål per veckodag syns inte' })
    note(state, `tabellen: ${JSON.stringify(table)}`)
    const settings = await waitFor(async () => (await idbJson(page, 'lagom-profile'))?.state?.settings?.weeklyBudget, { message: 'veckobudgeten sparades inte' })
    check(settings.enabled === true && settings.since === '2026-10-05', `sparad veckobudget: ${JSON.stringify(settings)}`)
    await checkOverflow(page, state, 'Mål och makron med veckobudgeten')

    // Idag på måndagen.
    await openHash(page, '#/')
    const monLabel = await ringLabel(page)
    const mon = ringTotal(monLabel)
    const monNote = await textOf(page.getByRole('region', { name: 'Dagsringen' }))
    check(/Veckobudget: \d+ kcal mindre idag – sparat till fredagsmyset/.test(monNote), `måndagens rad om veckobudgeten saknas: ${monNote.replace(/\n+/g, ' | ')}`)

    // Fredag (klockan flyttas och sidan laddas om).
    await page.clock.setFixedTime(FRIDAY)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    const friLabel = await ringLabel(page)
    const fri = ringTotal(friLabel)
    const friNote = await textOf(page.getByRole('region', { name: 'Dagsringen' }))
    note(state, `dagsmål: bas ${base}, måndag ${mon}, fredag ${fri} kcal`)
    check(mon !== null && fri !== null && fri > mon, `fredagens mål (${fri}) är inte högre än måndagens (${mon})`)
    check(fri - base === 300, `fredagen har ${fri - base} kcal extra i stället för 300 (Fredagsmys, standard)`)
    check(mon < base, `måndagen (${mon}) är inte lägre än basmålet (${base})`)
    check(/Fredagsmys: \+300 kcal idag/.test(friNote), `fredagens rad saknas: ${friNote.replace(/\n+/g, ' | ')}`)
    // Dagboken för fredagen säger samma sak.
    await nav(page, 'Dagbok')
    await textShown(page, 'Fredagsmys: +300 kcal i dagens budget', 5000)
    check((await dayBudget(page)) === fri, `dagbokens budget för fredagen är ${await dayBudget(page)} (Idag: ${fri})`)
    // Måndagen i dagboken: den lägre budgeten.
    await openHash(page, '#/dagbok/2026-10-05')
    await page.getByText(/^Veckobudget: \d+ kcal mindre i dagens budget – sparat till fredagsmyset$/).first().waitFor({ timeout: 5000 })
    check((await dayBudget(page)) === mon, `dagbokens budget för måndagen är ${await dayBudget(page)} (Idag på måndagen: ${mon})`)
    // Fredagen före veckobudgeten slogs på (since = 2026-10-05) har det jämna målet.
    await openHash(page, '#/dagbok/2026-10-02')
    const before = await dayBudget(page)
    const beforeText = await textOf(page.getByRole('main'))
    check(before === base && !/Fredagsmys|Veckobudget/.test(beforeText), `fredagen före since har budgeten ${before} (väntat ${base}) och raden ${/Fredagsmys[^\n]*|Veckobudget[^\n]*/.exec(beforeText)?.[0] ?? '–'}`)

    // Medvetet läge: inga siffror.
    await openHash(page, '#/installningar/utseende')
    const mindful = page.getByRole('switch', { name: 'Dölj siffrorna' })
    await mindful.click()
    check((await mindful.getAttribute('aria-checked')) === 'true', 'medvetet läge slogs inte på')
    await openHash(page, '#/')
    const mindfulLabel = await ringLabel(page)
    check(!/\d/.test(mindfulLabel), `dagsringen läser upp siffror i medvetet läge: ${mindfulLabel}`)
    const ringCard = await textOf(page.getByRole('region', { name: 'Dagsringen' }))
    check(!/\d+\s*(kcal|kJ)/.test(ringCard), `Dagsringen visar energi i medvetet läge: ${ringCard.replace(/\n+/g, ' | ')}`)
    check(/Fredagsmys idag – lite extra utrymme i dagsmålet\./.test(ringCard), `raden om fredagsmyset i medvetet läge saknas: ${ringCard.replace(/\n+/g, ' | ')}`)
    await openHash(page, '#/installningar/mal')
    const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Veckobudget', exact: true }) })
    await card.first().waitFor()
    const cardText = await textOf(card.first())
    check(!/\d/.test(cardText), `veckobudgetkortet visar siffror i medvetet läge: ${cardText.replace(/\n+/g, ' | ').slice(0, 300)}`)
    check((await weekTable(page)) === null, 'tabellen med dagsmål visas i medvetet läge')

    // Graviditet: veckobudgeten används inte alls (samma mål varje dag), även om den var påslagen.
    await openHash(page, '#/installningar/utseende')
    await page.getByRole('switch', { name: 'Dölj siffrorna' }).click()
    await openHash(page, '#/installningar/profil')
    const stage = page.getByRole('radiogroup', { name: 'Är du gravid eller ammar du?' })
    await stage.getByRole('radio', { name: 'Gravid' }).click()
    await page.getByRole('button', { name: 'Spara profilen' }).click()
    await waitFor(async () => (await idbJson(page, 'lagom-profile'))?.state?.profile?.lifeStage === 'gravid', { message: 'graviditeten sparades inte i profilen' })
    await openHash(page, '#/')
    const pregLabel = await ringLabel(page)
    const pregRing = await textOf(page.getByRole('region', { name: 'Dagsringen' }))
    check(!/Fredagsmys|Veckobudget/.test(pregRing), `Idag visar veckobudgeten vid graviditet: ${pregRing.replace(/\n+/g, ' | ')}`)
    await openHash(page, '#/dagbok/2026-10-05')
    const pregMon = await dayBudget(page)
    await openHash(page, '#/dagbok/2026-10-09')
    const pregFri = await dayBudget(page)
    note(state, `gravid: Idag (fredag) ${ringTotal(pregLabel)} kcal, dagboken måndag ${pregMon} / fredag ${pregFri} kcal`)
    check(pregMon === pregFri && pregFri === ringTotal(pregLabel), `vid graviditet skiljer sig dagsmålen: måndag ${pregMon}, fredag ${pregFri}, Idag ${ringTotal(pregLabel)}`)
    check(!/Fredagsmys|Veckobudget/.test(await textOf(page.getByRole('main'))), 'dagboken visar veckobudgeten vid graviditet')
    await openHash(page, '#/installningar/mal')
    const blockedSwitch = page.getByRole('switch', { name: 'Veckobudget' })
    check((await blockedSwitch.getAttribute('aria-checked')) === 'false' && (await blockedSwitch.isDisabled()), 'reglaget Veckobudget är inte avstängt och spärrat vid graviditet')
  },
}

// ---------------------------------------------------------------------------
// 5. Milstolpar
// ---------------------------------------------------------------------------

const MILESTONE_TOAST = 'Ny milstolpe: Första måltiden loggad. Välkommen igång!'

const milstolpar = {
  name: 'milstolpar',
  title: 'Första måltiden firas en gång, inte igen efter omladdning, och står på /mer/milstolpar',
  async run({ state, newPage }) {
    const page = await newPage()
    await countMilestoneToasts(page)
    await openApp(page, state, '#/')
    await onboard(page, state)
    // Den första kontrollen (1,2 s efter senaste ändringen) markerar det som redan finns som sett.
    await waitFor(async () => Array.isArray((await idbJson(page, 'lagom-profile'))?.state?.settings?.milestonesSeen), {
      timeout: 6000,
      message: 'milstolparna kontrollerades aldrig efter välkomstflödet (settings.milestonesSeen saknas)',
    })

    await quickAdd(page, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
    await textShown(page, MILESTONE_TOAST, 6000)
    const seen = await waitFor(async () => {
      const s = (await idbJson(page, 'lagom-profile'))?.state?.settings?.milestonesSeen
      return Array.isArray(s) && s.includes('forsta-maltiden') ? s : null
    }, { message: 'milstolpen sparades inte som sedd' })
    note(state, `milestonesSeen: ${JSON.stringify(seen)}`)
    await closeAdd(page)
    // En loggning till firar inte igen.
    await quickAdd(page, { meal: 'middag', query: 'kyckling', food: 'Kycklingbröst' })
    await page.waitForTimeout(3000)
    const count1 = (await milestoneToasts(page)).length
    check(count1 === 1, `milstolpen firades ${count1} gånger före omladdningen (väntat 1): ${JSON.stringify(await milestoneToasts(page))}`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await page.waitForTimeout(3500)
    const after = await milestoneToasts(page)
    check(after.length === 0, `milstolpen firades igen efter omladdningen: ${JSON.stringify(after)}`)

    // Mer → Milstolpar.
    await openHash(page, '#/')
    await nav(page, 'Mer')
    await navigateAndWait(page, () => page.getByRole('main').getByRole('link', { name: /Milstolpar/ }).first().click())
    await waitForHash(page, '/mer/milstolpar')
    await checkOverflow(page, state, 'Milstolpar')
    const main = await textOf(page.getByRole('main'))
    check(main.includes('Första måltiden loggad'), `sidan Milstolpar listar inte Första måltiden loggad: ${main.slice(0, 300)}`)
    check(!/i rad|streak/i.test(main), 'sidan Milstolpar nämner dagar i rad/streak')
  },
}

// ---------------------------------------------------------------------------
// 6. Framstegsbilder
// ---------------------------------------------------------------------------

/**
 * En liten JPEG ritad i sidan, med ett EXIF-segment (med GPS-text) och en kommentar med en plats
 * insatta efter SOI – för att se att appen tar bort allt sådant.
 */
async function jpegWithExif(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 120
    c.height = 160
    const g = c.getContext('2d')
    g.fillStyle = '#2e6b4f'
    g.fillRect(0, 0, 120, 160)
    g.fillStyle = '#f2c14e'
    g.fillRect(30, 40, 60, 80)
    return c.toDataURL('image/jpeg', 0.9).split(',')[1]
  })
  const jpeg = Buffer.from(b64, 'base64')
  const tiff = Buffer.concat([Buffer.from('MM\x00\x2a\x00\x00\x00\x08', 'latin1'), Buffer.from([0, 0, 0, 0, 0, 0]), Buffer.from('GPSLatitude 59.3293 N GPSLongitude 18.0686 E', 'latin1')])
  const exifPayload = Buffer.concat([Buffer.from('Exif\x00\x00', 'latin1'), tiff])
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(exifPayload.length + 2), exifPayload])
  const comText = Buffer.from('Plats: Stockholm 59.3293,18.0686', 'latin1')
  const com = Buffer.concat([Buffer.from([0xff, 0xfe]), u16(comText.length + 2), comText])
  return Buffer.concat([jpeg.subarray(0, 2), app1, com, jpeg.subarray(2)])
}

function u16(n) {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n)
  return b
}

/** Allt i IndexedDB-databasen lagom-bilder: nycklar och (för blobbar) om de innehåller EXIF/GPS. */
async function photoDb(page) {
  return page.evaluate(
    () =>
      new Promise((ok) => {
        const req = indexedDB.open('lagom-bilder')
        req.onerror = () => ok({ keys: [], error: String(req.error) })
        req.onupgradeneeded = () => {
          // Finns inte ännu: skapa inget – avbryt.
          req.transaction.abort()
        }
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('bilder')) {
            db.close()
            ok({ keys: [], blobs: [] })
            return
          }
          const tx = db.transaction('bilder', 'readonly')
          const os = tx.objectStore('bilder')
          const keysReq = os.getAllKeys()
          const valsReq = os.getAll()
          tx.oncomplete = async () => {
            const keys = keysReq.result.map(String)
            const blobs = []
            for (let i = 0; i < valsReq.result.length; i++) {
              // Bilderna sparas som { type, data: ArrayBuffer } (lib/progressPhotos.ts), meta som objekt.
              const v = valsReq.result[i]
              const bytes = v instanceof Blob ? await v.arrayBuffer() : v && typeof v === 'object' && v.data && typeof v.data.byteLength === 'number' ? v.data : null
              if (bytes) {
                const text = new TextDecoder('latin1').decode(bytes)
                blobs.push({ key: keys[i], type: v.type, size: bytes.byteLength, jpeg: text.charCodeAt(0) === 0xff && text.charCodeAt(1) === 0xd8, exif: text.includes('Exif'), gps: /GPSLatitude|59\.3293/.test(text), comment: text.includes('Plats:') })
              }
            }
            db.close()
            ok({ keys, blobs })
          }
        }
      }),
  )
}

const framstegsbilder = {
  name: 'framstegsbilder',
  title: 'Framstegsbilder: slå på → välj en JPEG → syns utan EXIF → radera → borta; aldrig på Idag',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)

    // Vikt & mått: kortet med "Slå på framstegsbilder".
    await openHash(page, '#/vikt')
    const enable = page.getByRole('button', { name: 'Slå på framstegsbilder' })
    await enable.waitFor({ timeout: 8000 })
    await enable.click()
    await textShown(page, 'Framstegsbilder är på')
    await waitFor(async () => (await idbJson(page, 'lagom-profile'))?.state?.settings?.progressPhotos === true, { message: 'inställningen sparades inte' })
    await openHash(page, '#/vikt/bilder')
    await checkOverflow(page, state, 'Framstegsbilder (tom)')

    const jpeg = await jpegWithExif(page)
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.getByRole('button', { name: 'Välj en bild' }).click()])
    await chooser.setFiles({ name: 'framsteg.jpg', mimeType: 'image/jpeg', buffer: jpeg })
    const save = page.getByRole('dialog', { name: 'Spara bilden' })
    await save.waitFor({ timeout: 8000 })
    await save.getByRole('img', { name: 'Förhandsvisning av bilden' }).waitFor()
    await save.getByRole('button', { name: 'Spara bilden' }).click()
    await textShown(page, 'Bilden är sparad')
    const thumb = page.getByRole('button', { name: /^Visa bilden från / })
    await thumb.first().waitFor({ timeout: 8000 })
    check((await thumb.count()) === 1, `${await thumb.count()} bilder visas i stället för 1`)
    const stored = await photoDb(page)
    note(state, `lagom-bilder: ${stored.keys.length} nycklar, blobbar ${JSON.stringify(stored.blobs.map((b) => ({ type: b.type, size: b.size })))}`)
    check(stored.blobs.length === 2 && stored.blobs.every((b) => b.jpeg && b.type === 'image/jpeg'), `lagom-bilder har inte en bild och en miniatyr som JPEG: ${JSON.stringify(stored)}`)
    const leaks = stored.blobs.filter((b) => b.exif || b.gps || b.comment)
    check(leaks.length === 0, `sparade bilder har kvar EXIF/GPS/kommentar: ${JSON.stringify(leaks)}`)
    // Aldrig i dagboksdatabasen (keyval-store).
    const keyval = JSON.stringify(await readIdb(page))
    check(!/data:image|framsteg\.jpg/.test(keyval), 'bilden (eller filnamnet) ligger i appens vanliga databas')

    // Idag visar aldrig bilderna.
    await openHash(page, '#/')
    const todayImgs = await page.evaluate(() => [...document.querySelectorAll('main img')].map((i) => i.getAttribute('src') ?? '').filter((s) => s.startsWith('blob:')))
    check(todayImgs.length === 0, `Idag visar ${todayImgs.length} bilder`)
    check(!/framstegsbild/i.test(await textOf(page.getByRole('main'))), 'Idag nämner framstegsbilder')

    // Medvetet läge: bilderna är helt dolda (kortet på Vikt & mått och sidan).
    await openHash(page, '#/installningar/utseende')
    await page.getByRole('switch', { name: 'Dölj siffrorna' }).click()
    await openHash(page, '#/vikt')
    await page.waitForTimeout(500)
    const bodyMindful = await textOf(page.getByRole('main'))
    check(!/Framstegsbilder/.test(bodyMindful), 'Vikt & mått visar framstegsbilder i medvetet läge')
    await openHash(page, '#/vikt/bilder')
    await textShown(page, 'Bilderna vilar i medvetet läge', 5000)
    check((await page.getByRole('button', { name: /^Visa bilden från / }).count()) === 0, 'bilderna visas i medvetet läge')
    await openHash(page, '#/installningar/utseende')
    await page.getByRole('switch', { name: 'Dölj siffrorna' }).click()

    // Öppna och radera.
    await openHash(page, '#/vikt/bilder')
    await page.getByRole('button', { name: /^Visa bilden från / }).first().click()
    const viewer = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Radera bilden' }) })
    await viewer.waitFor()
    await viewer.getByRole('button', { name: 'Radera bilden' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Radera bilden?' }).or(page.getByRole('dialog', { name: 'Radera bilden?' }))
    await confirm.waitFor()
    await confirm.getByRole('button', { name: 'Radera', exact: true }).click()
    await textShown(page, 'Bilden är raderad')
    await waitFor(async () => (await page.getByRole('button', { name: /^Visa bilden från / }).count()) === 0, { message: 'bilden syns fortfarande efter raderingen' })
    const afterDelete = await waitFor(async () => {
      const db = await photoDb(page)
      return db.blobs.length === 0 ? db : null
    }, { message: 'bilden ligger kvar i lagom-bilder efter raderingen' })
    note(state, `efter raderingen: ${afterDelete.keys.length} nycklar kvar (${afterDelete.keys.join(', ') || 'inga'})`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await page.getByText('Inga bilder ännu').first().waitFor({ timeout: 8000 })

    // En ny bild – och Radera all data tar bort den (bilderna ligger utanför STORE_KEYS).
    const [chooser2] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.getByRole('button', { name: 'Välj en bild' }).click()])
    await chooser2.setFiles({ name: 'framsteg2.jpg', mimeType: 'image/jpeg', buffer: jpeg })
    await page.getByRole('dialog', { name: 'Spara bilden' }).getByRole('button', { name: 'Spara bilden' }).click()
    await textShown(page, 'Bilden är sparad')
    await waitFor(async () => (await photoDb(page)).blobs.length === 2, { message: 'den andra bilden sparades inte' })
    await wipeAllViaSettings(page)
    const wiped = await waitFor(async () => {
      const db = await photoDb(page)
      return db.keys.length === 0 ? db : null
    }, { timeout: 5000, message: 'Radera all data tog inte bort framstegsbilderna (lagom-bilder)' })
    note(state, `efter Radera all data: lagom-bilder har ${wiped.keys.length} nycklar`)
  },
}

// ---------------------------------------------------------------------------
// 7. Exempeldata
// ---------------------------------------------------------------------------

function diaryCounts(d) {
  return { entries: allEntries(d).length, water: Object.values(d?.water ?? {}).reduce((a, b) => a + b, 0), exercise: Object.values(d?.exercise ?? {}).flat().length }
}

const exempeldata = {
  name: 'exempeldata',
  title: 'Exempeldata: sidorna har data, loggning visar exempelarket och ändrar ingenting',
  async run({ state, newPage }) {
    const page = await newPage()
    await countMilestoneToasts(page)
    await openApp(page, state, '#/')
    check(currentPath(page) === '/valkommen', `en ny användare borde hamna i välkomstflödet, hamnade på ${currentPath(page)}`)
    await navigateAndWait(page, () => page.getByRole('button', { name: 'Utforska med exempeldata' }).click())
    await waitForHash(page, '/')
    await waitForApp(page)
    await page.getByRole('note', { name: 'Exempeldata' }).waitFor({ timeout: 8000 })
    const ring = await ringLabel(page)
    const eaten = num(/Ätit ([\d ]+) kcal/.exec(ring)?.[1] ?? '0')
    check(eaten > 0, `Idag visar inget ätet i exemplet: ${ring}`)
    note(state, `Idag i exemplet: ${ring.slice(0, 120)}`)
    const before = await waitFor(async () => {
      const d = await idbDiary(page)
      return allEntries(d).length > 10 ? d : null
    }, { message: 'exempeldatan finns inte i IndexedDB' })
    const counts = diaryCounts(before)
    const license = await idbJson(page, 'lagom-license')
    check(!license?.state?.trialStartedAt, `exempeldatan startade provperioden: ${JSON.stringify(license?.state)}`)

    // Dagbok och Insikter har data.
    await nav(page, 'Dagbok')
    await page.getByRole('note', { name: 'Exempeldata' }).waitFor()
    const breakfast = await diaryMealEntries(page, 'Frukost')
    check(breakfast.length > 0, 'dagboken visar ingen frukost i exemplet')
    await nav(page, 'Insikter')
    check(!/Inget loggat/.test(await textOf(page.getByRole('main'))), 'Insikter säger att inget är loggat i exemplet')

    // Försök logga: vatten på Idag → arket "Det här är exempeldata".
    await nav(page, 'Idag')
    await page.getByRole('region', { name: 'Vatten' }).getByRole('button', { name: 'Lägg till ett glas (250 ml)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Det här är exempeldata' })
    await dialog.waitFor({ timeout: 5000 })
    check((await textOf(dialog)).includes('Skapa din egen profil'), 'exempelarket förklarar inte hur man börjar med sin egen profil')
    await dialog.getByRole('button', { name: /Stäng|Fortsätt titta|Titta vidare/ }).first().click()
    await dialog.waitFor({ state: 'hidden' })
    // Lägg till i lunch → sidan "Det här är exempeldata" i stället för sökningen.
    await page.getByRole('link', { name: 'Lägg till i lunch' }).first().click()
    await waitForHash(page, '/lagg-till')
    await page.getByRole('heading', { level: 1, name: 'Det här är exempeldata' }).waitFor({ timeout: 8000 })
    check((await page.getByLabel('Sök livsmedel').count()) === 0, 'sökningen visas trots exempeldata')
    // Ett recept: "Logga en portion".
    await openHash(page, `#/recept/${encodeURIComponent('klassiker-kottbullar')}`)
    const logPortion = page.getByRole('button', { name: 'Logga en portion' })
    if (await logPortion.isVisible().catch(() => false)) {
      await logPortion.click()
      const d2 = page.getByRole('dialog', { name: 'Det här är exempeldata' })
      await d2.waitFor({ timeout: 5000 })
      await page.keyboard.press('Escape')
      await d2.waitFor({ state: 'hidden' })
      note(state, 'receptet Köttbullar: Logga en portion visar exempelarket')
    } else note(state, 'receptet klassiker-kottbullar visades inte – hoppar över "Logga en portion"')

    await page.waitForTimeout(800)
    const after = diaryCounts(await idbDiary(page))
    check(JSON.stringify(after) === JSON.stringify(counts), `dagboken ändrades: före ${JSON.stringify(counts)}, efter ${JSON.stringify(after)}`)
    // Markeringen finns på Idag och Dagbok (inte på receptsidan).
    await openHash(page, '#/')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForApp(page)
    await page.getByRole('note', { name: 'Exempeldata' }).first().waitFor({ timeout: 8000 })
    const reloaded = diaryCounts(await idbDiary(page))
    check(JSON.stringify(reloaded) === JSON.stringify(counts), `efter omladdning: ${JSON.stringify(reloaded)} (väntat ${JSON.stringify(counts)})`)
    await page.waitForTimeout(2000)
    const celebrated = await milestoneToasts(page)
    check(celebrated.length === 0, `milstolpar firades för exempeldata: ${JSON.stringify(celebrated)}`)

    // Börja med min egen profil: exemplet tas bort, välkomstflödet, och provperioden startar först nu.
    await page.getByRole('note', { name: 'Exempeldata' }).getByRole('button', { name: 'Börja med min egen profil' }).click()
    const ask = page.getByRole('alertdialog', { name: 'Börja med din egen profil?' }).or(page.getByRole('dialog', { name: 'Börja med din egen profil?' }))
    await ask.waitFor()
    await ask.getByRole('button', { name: 'Börja', exact: true }).click()
    await waitForHash(page, '/valkommen')
    await waitForApp(page)
    await onboard(page, state, { name: 'Egen' })
    check((await page.getByRole('note', { name: 'Exempeldata' }).count()) === 0, 'markeringen Exempeldata finns kvar med den egna profilen')
    const own = await waitFor(async () => {
      const all = await readIdb(page)
      const lic = all['lagom-license'] ? JSON.parse(all['lagom-license']) : null
      return typeof lic?.state?.trialStartedAt === 'number' ? { all, lic } : null
    }, { message: 'provperioden startade inte när den egna profilen skapades' })
    const ownDiary = diaryCounts(diaryFromIdb(own.all))
    check(ownDiary.entries === 0 && ownDiary.water === 0 && ownDiary.exercise === 0, `exempeldatan finns kvar i den egna profilen: ${JSON.stringify(ownDiary)}`)
    await page.getByRole('region', { name: 'Dagsringen' }).waitFor()
    check(/Ätit 0 kcal/.test(await ringLabel(page)), `Idag med den egna profilen: ${await ringLabel(page)}`)
    // Den egna profilen kan logga.
    await quickAdd(page, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
    await waitFor(async () => allEntries(await idbDiary(page)).length === 1, { message: 'den egna profilen kan inte logga' })
  },
}

// ---------------------------------------------------------------------------
// 8. Provperioden slut
// ---------------------------------------------------------------------------

const provperiodenSlut = {
  name: 'provperioden-slut',
  title: 'Provperioden slut: se och exportera går, loggning visar köparket, inget raderas',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    const today = todayStockholm()
    await quickAdd(page, { meal: 'lunch', query: 'kyckling', food: 'Kycklingbröst' })
    await closeAdd(page)
    await page.getByRole('region', { name: 'Vatten' }).getByRole('button', { name: 'Lägg till ett glas (250 ml)' }).click()
    await waitFor(async () => {
      const d = await idbDiary(page)
      return allEntries(d).length === 1 && d.water?.[today] === 250
    }, { message: 'posten och vattnet sparades inte' })
    // En framstegsbild under provperioden – att titta på och radera den spärras aldrig.
    await openHash(page, '#/vikt')
    await page.getByRole('button', { name: 'Slå på framstegsbilder' }).click()
    await openHash(page, '#/vikt/bilder')
    const jpeg = await jpegWithExif(page)
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.getByRole('button', { name: 'Välj en bild' }).click()])
    await chooser.setFiles({ name: 'framsteg.jpg', mimeType: 'image/jpeg', buffer: jpeg })
    await page.getByRole('dialog', { name: 'Spara bilden' }).getByRole('button', { name: 'Spara bilden' }).click()
    await textShown(page, 'Bilden är sparad')
    await openHash(page, '#/')

    // Provperioden startade för 20 dagar sedan (14 dagar gratis).
    const license = await idbJson(page, 'lagom-license')
    check(typeof license?.state?.trialStartedAt === 'number', `ingen provperiod i lagom-license: ${JSON.stringify(license)}`)
    await page.goto(`${state.base}${BLANK_PATH}`)
    const ended = { ...license, state: { ...license.state, trialStartedAt: Date.now() - 20 * DAY_MS } }
    await writeIdb(page, { 'lagom-license': JSON.stringify(ended) })
    const diaryBefore = (await readIdb(page))['lagom-diary']
    await openApp(page, state, '#/')
    check(currentPath(page) === '/', `appen visar ${currentPath(page)} i stället för Idag`)

    // Se: posten och vattnet syns.
    await page.getByRole('region', { name: 'Vatten' }).getByText(/^0,25\s+liter av/).waitFor({ timeout: 5000 })
    // Logga vatten → arket "Provperioden är slut".
    await page.getByRole('region', { name: 'Vatten' }).getByRole('button', { name: 'Lägg till ett glas (250 ml)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Provperioden är slut' })
    await dialog.waitFor({ timeout: 5000 })
    const dialogText = await textOf(dialog)
    check(/fylla på vatten/.test(dialogText) && /finns kvar/.test(dialogText), `arket förklarar inte: ${dialogText.replace(/\n+/g, ' | ')}`)
    check(await dialog.getByRole('button', { name: 'Exportera min data' }).isVisible(), 'arket saknar Exportera min data')
    check(await dialog.getByRole('button', { name: 'Se priser' }).isVisible(), 'arket saknar Se priser')
    await checkOverflow(page, state, 'arket Provperioden är slut')
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    // Lägg till i lunch → sidan "Provperioden är slut".
    await page.getByRole('link', { name: 'Lägg till i lunch' }).first().click()
    await waitForHash(page, '/lagg-till')
    await page.getByRole('heading', { level: 1, name: 'Provperioden är slut' }).waitFor({ timeout: 8000 })
    await textShown(page, 'Din data är trygg')
    // Dagboken visar posten.
    await openHash(page, '#/dagbok')
    const lunch = await diaryMealEntries(page, 'Lunch')
    check(lunch.length === 1 && lunch[0].name === 'Kycklingbröst', `dagboken efter provperioden: ${JSON.stringify(lunch)}`)
    // Exportera går.
    await openHash(page, '#/installningar/data')
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: 'Exportera (JSON)' }).click()])
    const path = join(SHOT_DIR, 'provperioden-slut-export.json')
    await download.saveAs(path)
    check(readFileSync(path, 'utf8').includes('Kycklingbröst'), 'exporten saknar posten')
    // Priser (webbygget: kronor är tillåtna här).
    await openHash(page, '#/premium')
    await page.getByRole('main').getByRole('button', { name: 'Exportera min data' }).or(page.getByRole('main').getByRole('link', { name: 'Exportera min data' })).first().waitFor({ timeout: 8000 })

    // Framstegsbilden: syns och kan raderas, men en ny bild ger köparket.
    await openHash(page, '#/vikt/bilder')
    const thumb = page.getByRole('button', { name: /^Visa bilden från / })
    await thumb.first().waitFor({ timeout: 8000 })
    await page.getByRole('button', { name: 'Välj en bild' }).click()
    const photoGate = page.getByRole('dialog', { name: 'Provperioden är slut' })
    await photoGate.waitFor({ timeout: 5000 })
    check((await textOf(photoGate)).includes('spara framstegsbilder'), `arket för en ny bild: ${(await textOf(photoGate)).replace(/\n+/g, ' | ')}`)
    await page.keyboard.press('Escape')
    await photoGate.waitFor({ state: 'hidden' })
    await thumb.first().click()
    const viewer = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Radera bilden' }) })
    await viewer.waitFor()
    await viewer.getByRole('img').first().waitFor({ timeout: 5000 })
    await viewer.getByRole('button', { name: 'Radera bilden' }).click()
    const confirmPhoto = page.getByRole('alertdialog', { name: 'Radera bilden?' }).or(page.getByRole('dialog', { name: 'Radera bilden?' }))
    await confirmPhoto.waitFor()
    await confirmPhoto.getByRole('button', { name: 'Radera', exact: true }).click()
    await textShown(page, 'Bilden är raderad')
    check((await page.getByRole('dialog', { name: 'Provperioden är slut' }).count()) === 0, 'att radera bilden gav köparket')
    await waitFor(async () => (await photoDb(page)).blobs.length === 0, { message: 'bilden raderades inte efter provperioden' })

    // Inget raderas eller skrivs om – även efter två omladdningar.
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForApp(page)
    }
    await page.waitForTimeout(800)
    const all = await readIdb(page)
    const d = diaryFromIdb(all)
    check(allEntries(d).length === 1 && d.water?.[today] === 250, `dagboken efter provperioden: ${JSON.stringify(diaryCounts(d))}`)
    if (all['lagom-diary'] !== diaryBefore) note(state, 'lagom-diary skrevs om under resan (samma innehåll)')
    const lic = JSON.parse(all['lagom-license'])
    check(lic.state.trialStartedAt === ended.state.trialStartedAt, `provperioden ändrades: ${JSON.stringify(lic.state)}`)

    // Att radera en egen post går precis som vanligt.
    await openHash(page, '#/dagbok')
    await page.getByRole('main').getByRole('region', { name: 'Lunch', exact: true }).getByRole('button', { name: /^Ändra Kycklingbröst/ }).click()
    const entrySheet = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Ta bort' }) })
    await entrySheet.waitFor()
    await entrySheet.getByRole('button', { name: 'Ta bort' }).click()
    check((await page.getByRole('dialog', { name: 'Provperioden är slut' }).count()) === 0, 'att ta bort en post gav köparket')
    await waitFor(async () => allEntries(await idbDiary(page)).length === 0, { message: 'posten gick inte att ta bort efter provperioden' })
  },
}

// ---------------------------------------------------------------------------
// 9. Butiksbyggena
// ---------------------------------------------------------------------------

/** Kronpriser i löptext ("299 kr", "29 kr/mån", "1 299 kronor"). */
const KRONOR = /\d[\d\s ]*\s?(kr|kronor|SEK)(?!\p{L})/iu

async function checkStoreBuild(browser, state, variant) {
  const dir = STORE_DIRS[variant]
  const server = await startServer(dir, { csp: false })
  const savedBase = state.base
  state.base = server.base
  let context = null
  try {
    context = await newAppContext(browser, state, server.base, {})
    // Webbplatsens adress i butiksbygget (VITE_API_BASE) – spärrlistan m.m. Svara tomt.
    answerExternal(state, (u) => u.startsWith('https://lagom.invalid/'), (url) => {
      note(state, `${variant}: anrop till ${url}`)
      return { status: 404, contentType: 'application/json', body: '{}' }
    })
    const page = await context.newPage()
    state.pages.push(page)
    await openApp(page, state, '#/')
    check(currentPath(page) === '/valkommen', `${variant}: en ny användare hamnar på ${currentPath(page)}`)
    const welcome = await textOf(page.locator('body'))
    check(!welcome.includes('Återställ säkerhetskopia') || variant === 'web', `${variant}: välkomstflödet erbjuder Återställ säkerhetskopia (bara webben)`)
    await onboard(page, state, { name: variant === 'appstore' ? 'Äpple' : 'Play' })
    check(currentPath(page) === '/', `${variant}: efter välkomstflödet visas ${currentPath(page)}`)
    const sw = await page.evaluate(async () => ('serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : -1))
    check(sw <= 0, `${variant}: ${sw} service worker registrerad (butiksbyggena ska inte ha någon)`)

    // Premium.
    await openHash(page, '#/premium')
    await checkOverflow(page, state, `${variant}: Premium`)
    const premium = await textOf(page.getByRole('main'))
    const kr = KRONOR.exec(premium)
    check(!kr, `${variant}: Premium visar kronpris "${kr?.[0]}" (…${premium.slice(Math.max(0, (kr?.index ?? 0) - 60), (kr?.index ?? 0) + 40).replace(/\n+/g, ' | ')}…)`)
    check(!/stripe|checkout/i.test(premium), `${variant}: Premium nämner Stripe/Checkout`)
    const restore = page.getByRole('main').getByRole('button', { name: 'Återställ köp' })
    check((await restore.count()) > 0, `${variant}: knappen Återställ köp saknas på Premium`)
    // Utan butik (webbläsaren) ska knappen svara lugnt – aldrig hänga eller ge ett sidfel.
    await restore.first().click()
    const answer = page.getByText(/^(Inga köp att återställa|Köpen kunde inte återställas just nu|Dina köp är återställda|Din provperiod är återställd)/).first()
    await answer.waitFor({ timeout: 8000 })
    note(state, `${variant}: Återställ köp i webbläsaren → "${(await answer.textContent())?.slice(0, 80)}"`)
    const store = variant === 'appstore' ? 'App Store' : 'Google Play'
    check(premium.includes(`Köpet görs i ${store}`), `${variant}: Premium säger inte "Köpet görs i ${store}"`)
    const keyField = page.getByRole('textbox', { name: /licensnyckel|nyckel/i })
    const keyCount = await keyField.count()
    if (variant === 'appstore') {
      check(keyCount === 0 && !/Klistra in (hela )?(licens)?nyckeln/i.test(premium), `appstore: Premium har ett fält för licensnyckel (${keyCount})`)
    } else note(state, `play: fält för licensnyckel på Premium: ${keyCount}`)
    // Licens i Inställningar.
    await openHash(page, '#/installningar/licens')
    const lic = await textOf(page.getByRole('main'))
    check(!KRONOR.test(lic) && !/stripe/i.test(lic), `${variant}: Inställningar → Licens visar kronor/Stripe: ${(KRONOR.exec(lic) ?? [''])[0]}`)
    check((await page.getByRole('main').getByRole('button', { name: 'Återställ köp' }).count()) > 0, `${variant}: Inställningar → Licens saknar Återställ köp`)
    if (variant === 'appstore') check((await page.getByRole('textbox', { name: /nyckel/i }).count()) === 0, 'appstore: Inställningar → Licens har ett fält för licensnyckel')
    // Tacksidan finns inte (webbköpen är borttagna).
    await page.evaluate(() => {
      location.hash = '#/tack?session_id=cs_test_123'
    })
    await waitFor(() => currentPath(page) !== '/tack', { timeout: 5000, message: `${variant}: #/tack finns i butiksbygget` })
    // Provperioden slut: arket utan kronor och med Återställ köp.
    await page.goto(`${state.base}${BLANK_PATH}`)
    const license = JSON.parse((await readIdb(page))['lagom-license'])
    await writeIdb(page, { 'lagom-license': JSON.stringify({ ...license, state: { ...license.state, trialStartedAt: Date.now() - 20 * DAY_MS } }) })
    await openApp(page, state, '#/')
    await page.getByRole('region', { name: 'Vatten' }).getByRole('button', { name: 'Lägg till ett glas (250 ml)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Provperioden är slut' })
    await dialog.waitFor({ timeout: 5000 })
    const dText = await textOf(dialog)
    check(!KRONOR.test(dText) && !/stripe/i.test(dText), `${variant}: arket Provperioden är slut visar kronor/Stripe: ${dText.replace(/\n+/g, ' | ')}`)
    check((await dialog.getByRole('button', { name: 'Återställ köp' }).count()) > 0, `${variant}: arket Provperioden är slut saknar Återställ köp`)
    if (variant === 'appstore') check((await dialog.getByRole('button', { name: 'Jag har redan en licensnyckel' }).count()) === 0, 'appstore: arket erbjuder licensnyckel')
    note(state, `${variant}: arket: ${dText.replace(/\n+/g, ' | ').slice(0, 220)}`)
  } finally {
    await context?.close().catch(() => {})
    state.base = savedBase
    await server.close()
  }
}

const butiksbyggen = {
  name: 'butiksbyggen',
  title: 'App Store- och Play-byggena i Chromium: välkomstflödet, inga kronpriser/Stripe, Återställ köp, ingen nyckel i App Store',
  async run({ browser, state }) {
    for (const variant of ['appstore', 'play']) {
      const before = state.consoleErrors.length
      await checkStoreBuild(browser, state, variant)
      for (const c of state.consoleErrors.slice(before)) c.at = `${variant} ${c.at}`
    }
  },
}

// ---------------------------------------------------------------------------
// 10. Tillgänglighet (snabb)
// ---------------------------------------------------------------------------

const NAMED_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'switch', 'checkbox', 'radio', 'combobox', 'textbox', 'searchbox', 'spinbutton', 'slider'])
const LANDMARKS = new Set(['banner', 'main', 'navigation', 'complementary', 'contentinfo', 'search', 'region', 'form'])

/** Chromiums egen tillgänglighetsträd (CDP): namnlösa kontroller och landmärken. */
async function axAudit(page) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('Accessibility.enable')
    const { nodes } = await cdp.send('Accessibility.getFullAXTree')
    const describe = async (n) => {
      try {
        const { outerHTML } = await cdp.send('DOM.getOuterHTML', { backendNodeId: n.backendDOMNodeId })
        return outerHTML.replace(/\s+/g, ' ').slice(0, 180)
      } catch {
        return `(${n.role?.value})`
      }
    }
    const unnamed = []
    const landmarks = {}
    for (const n of nodes) {
      if (n.ignored) continue
      const role = n.role?.value
      const name = String(n.name?.value ?? '').trim()
      if (NAMED_ROLES.has(role) && name === '') unnamed.push(`${role}: ${await describe(n)}`)
      if (LANDMARKS.has(role)) (landmarks[role] ??= []).push({ name, html: await describe(n) })
    }
    const landmarkIssues = []
    for (const [role, list] of Object.entries(landmarks)) {
      // Namnlösa region/form är inga landmärken.
      const real = role === 'region' || role === 'form' ? list.filter((l) => l.name) : list
      if (real.length < 2) continue
      const noName = real.filter((l) => !l.name)
      const names = real.map((l) => l.name).filter(Boolean)
      const dupes = names.filter((x, i) => names.indexOf(x) !== i)
      if (noName.length > 0) landmarkIssues.push(`${real.length} × ${role}, ${noName.length} utan namn: ${noName.map((l) => l.html.slice(0, 90)).join(' ; ')}`)
      if (dupes.length > 0) landmarkIssues.push(`${role} med samma namn: ${[...new Set(dupes)].join(', ')}`)
    }
    return { unnamed, landmarkIssues, landmarks: Object.fromEntries(Object.entries(landmarks).map(([r, l]) => [r, l.map((x) => x.name || '(utan namn)')])) }
  } finally {
    await cdp.detach().catch(() => {})
  }
}

/** Rubrikerna i dokumentordning (synliga, inte i aria-hidden) och hopp i nivåerna. */
async function headingAudit(page) {
  return page.evaluate(() => {
    const out = []
    for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
      if (h.closest('[aria-hidden="true"], [hidden], [inert]')) continue
      if (typeof h.checkVisibility === 'function' && !h.checkVisibility()) continue
      const level = Number(h.getAttribute('aria-level')) || Number(h.tagName.slice(1)) || 2
      out.push({ level, text: (h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50) })
    }
    const issues = []
    if (out.length > 0 && out[0].level !== 1) issues.push(`första rubriken är h${out[0].level} "${out[0].text}"`)
    for (let i = 1; i < out.length; i++) {
      if (out[i].level > out[i - 1].level + 1) issues.push(`h${out[i - 1].level} "${out[i - 1].text}" → h${out[i].level} "${out[i].text}"`)
    }
    const h1 = out.filter((h) => h.level === 1)
    if (h1.length !== 1) issues.push(`${h1.length} h1: ${h1.map((h) => `"${h.text}"`).join(', ')}`)
    return { headings: out, issues }
  })
}

const tillganglighet = {
  name: 'tillganglighet-snabb',
  title: 'Idag, Dagbok, Lägg till och Inställningar: namn, landmärken och rubriker; tabb genom arket i Lägg till',
  async run({ state, newPage }) {
    const page = await newPage()
    await openApp(page, state, '#/')
    await onboard(page, state)
    const findings = []
    for (const [label, hash] of [
      ['Idag', '#/'],
      ['Dagbok', '#/dagbok'],
      ['Lägg till', '#/lagg-till?maltid=lunch'],
      ['Inställningar', '#/installningar'],
    ]) {
      await openHash(page, hash)
      await page.waitForTimeout(600)
      const ax = await axAudit(page)
      const hs = await headingAudit(page)
      for (const u of ax.unnamed) findings.push(`${label}: namnlös ${u}`)
      for (const l of ax.landmarkIssues) findings.push(`${label}: landmärken: ${l}`)
      for (const h of hs.issues) findings.push(`${label}: rubriker: ${h}`)
      note(state, `${label}: landmärken ${JSON.stringify(ax.landmarks)}; rubriker ${hs.headings.map((h) => `h${h.level}`).join(' ')}`)
    }

    // Lägg till: sök, öppna arket och tabba igenom det.
    await openHash(page, '#/lagg-till?maltid=lunch')
    await page.getByLabel('Sök livsmedel').fill('kyckling')
    const row = page.getByRole('button', { name: /^Kycklingbröst, .*Välj mängd/ })
    await row.waitFor()
    const sAx = await axAudit(page)
    for (const u of sAx.unnamed) findings.push(`Lägg till med sökträffar: namnlös ${u}`)
    await row.focus()
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog', { name: 'Kycklingbröst' })
    await sheet.waitFor()
    await page.waitForTimeout(500)
    const inside = () =>
      page.evaluate(() => {
        const a = document.activeElement
        const d = document.querySelector('[role="dialog"][aria-modal="true"]')
        const label = a ? `${a.tagName.toLowerCase()}:${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}` : 'inget'
        return { inDialog: Boolean(d && a && d.contains(a)), body: !a || a === document.body, label }
      })
    const first = await inside()
    check(first.inDialog, `fokus hamnar inte i arket när det öppnas (fokus på ${first.label})`)
    const seen = []
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(i % 10 === 9 ? 'Shift+Tab' : 'Tab')
      const f = await inside()
      if (!f.inDialog) {
        findings.push(`arket Kycklingbröst: fokus lämnar arket efter ${i + 1} tabbar (fokus på ${f.body ? 'body' : f.label})`)
        break
      }
      if (!seen.includes(f.label)) seen.push(f.label)
    }
    note(state, `arket: ${seen.length} olika element nås med tabb (${seen.slice(0, 8).join(', ')} …)`)
    const sheetAx = await axAudit(page)
    for (const u of sheetAx.unnamed) findings.push(`arket Kycklingbröst: namnlös ${u}`)
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'hidden' })
    await page.waitForTimeout(300)
    const back = await page.evaluate(() => {
      const a = document.activeElement
      return a && a !== document.body ? (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 60) : null
    })
    if (!back) findings.push('arket Kycklingbröst: efter Escape står fokus på body (inte tillbaka på raden)')
    else note(state, `efter Escape: fokus på "${back}"`)
    await checkFocusFlow(page, state, 'Lägg till med sökträffar')

    check(findings.length === 0, `tillgänglighetsfynd:\n      ${findings.join('\n      ')}`)
  },
}

export const JOURNEYS = [delaRecept, etikett, allergier, veckobudget, milstolpar, framstegsbilder, exempeldata, provperiodenSlut, butiksbyggen, tillganglighet]

async function main() {
  const args = parseArgs(splitArgs(process.argv.slice(2)))
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 32).join('\n'))
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
