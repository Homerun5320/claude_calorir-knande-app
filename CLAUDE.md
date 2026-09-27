# Lagom – utvecklarkonventioner

Lagom är en svensk kalori- och näringsdagbok (PWA): React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4 + Zustand 5 (persisterat i IndexedDB via idb-keyval). All data stannar lokalt på enheten.

## Kommandon

- `npx tsc -b` – typkontroll (måste vara felfri)
- `npx vitest run [sökväg]` – tester (vitest + jsdom + fake-indexeddb, `globals: true`)
- `npx vite build` – produktionsbygge
- Ändra inte `package.json` och installera inga paket. Om ett paket verkligen behövs: skriv det i din slutrapport.

## Kodstil

- `erasableSyntaxOnly` + `verbatimModuleSyntax`: inga `enum`, inga parameter properties, använd `import type` för typer.
- `strict`, `noUnusedLocals`, `noUnusedParameters` är på.
- Importera med relativa sökvägar eller aliaset `@/` (= `src/`).
- Domäntyper finns i `src/types.ts`. Näringsämnen i `src/lib/nutrients.ts` (`NUTRIENTS`, `NutrientKey`, `sumNutrients`, `scaleNutrients` …).
- Kommentarer och all text som användaren ser skrivs på **svenska** med korrekt å/ä/ö. Kodidentifierare på engelska.
- Siffror visas alltid med `src/lib/format.ts` (decimalkomma, `formatNumber`, `formatNutrient`, `formatEnergy`, `formatGrams`). Tolka inmatade tal med `parseSwedishNumber` (klarar "1,5").
- Datum är lokala `ISODate`-strängar ('YYYY-MM-DD') – använd `src/lib/dates.ts` (`todayISO`, `addDays`, `relativeDayLabel`, `isoWeek` …). Veckan börjar på måndag.
- Mått: `src/lib/units.ts` (`gramsFor`, `availableUnits`, `formatAmount`) – svenska köksmått dl/msk/tsk/krm/cl och portioner.
- Ett saknat näringsvärde (`undefined`) betyder okänt, inte 0. Visa "–".

## Zustand – viktigt

- Butiker: `useProfileStore`, `useDiaryStore`, `useFoodStore`, `useBodyStore`, `useFastingStore` i `src/stores/`.
- Selektorer får **inte** skapa nya objekt/arrayer vid varje anrop (ger oändlig renderingsloop i React 19). Välj fält var för sig, använd stabila tomma konstanter (`?? EMPTY`) eller `useShallow` från `zustand/react/shallow`. Beräkna härledda värden med `useMemo`.
- Färdiga hooks: `useDay(date)` (poster, summor, vatten, träning), `useTargets()` (dagsmål), `useToday()`.
- Toast-notiser: `toast('Tillagt', { action: { label: 'Ångra', onClick } })` från `src/components/ui/toast.tsx`.

## Design – "Nordisk natur"

Designsystemet finns i `src/index.css`. Använd alltid tokens, aldrig hårdkodade färger (då fungerar mörkt läge automatiskt):

- Ytor: `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-surface-3`, `border-line`
- Text: `text-ink`, `text-ink-2`, `text-ink-3`
- Primär: `bg-gran text-on-gran`, `text-gran`, `bg-gran-soft`
- Accenter (+ `-soft`): `lingon` (protein/varning), `hjortron` (kolhydrater), `blabar` (fett), `mossa` (fibrer/bra), `vinbar` (alkohol), `fjall` (vatten), `sol` (höjdpunkter)
- Semantiska: `text-protein`, `bg-carbs`, `text-fat`, `bg-fiber`, `text-water`, `text-good`, `text-warn`, `text-bad`
- Typsnitt: `font-display` (Fraunces) för rubriker och stora siffror, klassen `display-num` för stora tal, `eyebrow` för små etiketter i versaler. Brödtext Inter.
- Kort: klassen `card` (rundad 1.5rem, mjuk skugga) + `p-4`/`p-5`. Knappar/chips rundade (`rounded-2xl`/`rounded-full`).
- Ikoner: `lucide-react`. Animationer: `motion/react` (sparsamt, fjädrande; respektera reducerad rörelse).
- Mobil först (375 px), innehåll max `max-w-3xl`. Tryckytor minst 44 px. Sidor har `px-4` och inleds med `PageHeader` (som hanterar safe area – lägg inte till `pt-safe` utöver den).
- Tillgänglighet: semantiska element, `aria-label` på ikonknappar, etiketter på fält, synlig fokus.

## Ton

Varm, uppmuntrande och icke-dömande – "lagom". Aldrig skuld eller skam kring mat. Inga röda "du har ätit för mycket"-varningar; använd neutrala formuleringar ("Över målet idag – helt okej, det jämnar ut sig över veckan"). Säkerhet: kalorigolv, ingen viktnedgång vid graviditet/amning/under 18 år, hänvisning till 1177 och Frisk & Fri vid oro för ätstörningar.

## Källor

- Livsmedelsverkets livsmedelsdatabas (namn och näringsvärden per 100 g), Nordiska näringsrekommendationer 2023 (NNR 2023), Livsmedelsverkets kostråd, Tallriksmodellen.
- Open Food Facts (streckkoder, ODbL) – anropas från klienten.
