/**
 * Graviditets- och amningsråd: rätt råd för rätt livsmedel – och inga råd där Livsmedelsverket
 * säger att det går bra.
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_FOODS } from '../data/foods'
import type { Food, FoodCategory } from '../types'
import { BREASTFEEDING_RULES, PREGNANCY_RULES, pregnancyNotes, pregnancyNoteTitle } from './pregnancy'

function food(name: string, category: FoodCategory, extra: Partial<Food> = {}): Food {
  return { id: `test:${name}`, name, source: 'custom', category, nutrients: {}, portions: [], ...extra }
}

const builtin = (id: string): Food => {
  const f = BUILTIN_FOODS.find((x) => x.id === id)
  if (!f) throw new Error(`Saknas: ${id}`)
  return f
}

const ids = (f: Food, stage: 'gravid' | 'ammar' = 'gravid') => pregnancyNotes(f, stage).map((r) => r.id)

describe('pregnancyNotes – gravid', () => {
  it('brie och andra mögel- och kittostar', () => {
    expect(ids(builtin('lagom:brie'))).toEqual(['mogelost'])
    expect(ids(builtin('lagom:adelost'))).toEqual(['mogelost'])
    expect(ids(builtin('lagom:chevre'))).toEqual(['mogelost'])
    expect(ids(food('Vitmögelost brie fett ca 38 %', 'ost', { lmvNumber: 92 }))).toEqual(['mogelost'])
    expect(ids(food('Gorgonzola dolce', 'ost'))).toEqual(['mogelost'])
    expect(ids(food('Vacherol', 'ost'))).toEqual(['mogelost'])
    expect(ids(food('Taleggio', 'ost'))).toEqual(['mogelost'])
    // Även veganska varianter.
    expect(ids(food('Vegansk camembert', 'vegoprotein'))).toEqual(['mogelost'])
  })

  it('lever och leverrätter', () => {
    expect(ids(builtin('lagom:kalvlever-stekt'))).toEqual(['lever'])
    expect(ids(food('Kyckling lever stekt', 'fagel'))).toEqual(['lever'])
    expect(ids(food('Leverbiff mald lever stekt hemlagad', 'rott_kott'))).toEqual(['lever'])
    expect(ids(food('Gryta levergryta nöt', 'fardigratt'))).toEqual(['lever'])
    // Korvkaka innehåller lever utan att det står i namnet – känns igen på livsmedelsnumret.
    expect(ids(food('Korvkaka', 'bakverk', { lmvNumber: 1463 }))).toEqual(['lever'])
  })

  it('fiskleverolja', () => {
    expect(ids(food('Möllers tran', 'kosttillskott'))).toEqual(['fiskleverolja'])
    expect(ids(food('Torskleverolja kapslar', 'kosttillskott'))).toEqual(['fiskleverolja'])
  })

  it('gravlax, kallrökt och varmrökt fisk', () => {
    expect(ids(builtin('lagom:lax-gravad'))).toEqual(['gravad-rokt-fisk'])
    expect(ids(builtin('lagom:lax-kallrokt'))).toEqual(['gravad-rokt-fisk'])
    expect(ids(builtin('lagom:lax-varmrokt'))).toEqual(['gravad-rokt-fisk'])
    // Böckling är rökt strömming – båda råden gäller.
    expect(ids(builtin('lagom:bockling'))).toEqual(['gravad-rokt-fisk', 'dioxin'])
    // Ugnsbakad lax är tillagad.
    expect(ids(builtin('lagom:lax-odlad-ugnsbakad'))).toEqual([])
  })

  it('tonfisk: färsk "gärna, men inte ofta" – burk går bra', () => {
    const fresh = pregnancyNotes(builtin('lagom:farsk-tonfisk'), 'gravid')
    expect(fresh.map((r) => r.id)).toEqual(['tonfisk-farsk'])
    expect(fresh[0].text).toMatch(/gärna någon gång, men inte ofta/)
    expect(fresh[0].text).toMatch(/inte tonfisk varje gång/)
    const canned = pregnancyNotes(builtin('lagom:tonfisk-vatten'), 'gravid')
    expect(canned.map((r) => r.id)).toEqual(['tonfisk-burk'])
    expect(canned[0].text).toMatch(/går bra/)
    expect(ids(food('Sushi nigiri m. tonfisk', 'snabbmat', { lmvNumber: 1365 }))).toEqual(['tonfisk-farsk'])
  })

  it('skivat pålägg, paté och torkat kött', () => {
    expect(ids(builtin('lagom:skinka-rokt-palagg'))).toEqual(['palagg'])
    expect(ids(builtin('lagom:mortadella'))).toEqual(['palagg'])
    expect(ids(food('Kalkon rökt tunna skivor', 'fagel'))).toEqual(['palagg'])
    expect(ids(food('Påläggskorv medvurst fett 23 %', 'chark', { lmvNumber: 1496 }))).toEqual(['palagg'])
    // Rökt medvurst går bra fram till utgångsdatum.
    expect(ids(builtin('lagom:medwurst'))).toEqual([])
    expect(ids(food('Lantpaté', 'rott_kott'))).toEqual(['pate'])
    // Leverpaté liknar leverpastej (lite lever) – bara rådet om paté, inte om lever.
    expect(ids(food('Grönpepparpaté', 'rott_kott', { lmvNumber: 1483 }))).toEqual(['pate'])
    expect(ids(food('Paté älgfärs kycklinglever', 'rott_kott'))).toEqual(['pate'])
    expect(ids(builtin('lagom:salami'))).toEqual(['torkat-kott'])
    expect(ids(builtin('lagom:lufttorkad-skinka'))).toEqual(['torkat-kott'])
    // Kalkonbröst som middag är varm mat.
    expect(ids(builtin('lagom:kalkonfile-stekt'))).toEqual([])
    // Salami på pizza har hettats upp.
    expect(ids(food('Pizza Pepperoni m. salami', 'snabbmat'))).toEqual([])
  })

  it('opastöriserad mjölk och färskost', () => {
    expect(ids(food('Opastöriserad mjölk från gården', 'mejeri'))).toEqual(['opastoriserad-mjolk'])
    expect(ids(food('Färskost av opastöriserad getmjölk', 'ost'))).toEqual(['opastoriserad-farskost'])
    // Hårdost av opastöriserad mjölk går bra.
    expect(ids(food('Hårdost av opastöriserad mjölk', 'ost'))).toEqual([])
  })

  it('kvicksilver, dioxin, koffein, alkohol och örtte', () => {
    expect(ids(builtin('lagom:insjofisk'))).toEqual(['kvicksilver'])
    expect(ids(builtin('lagom:havsabborre'))).toEqual([])
    expect(ids(builtin('lagom:stromming'))).toEqual(['dioxin'])
    expect(ids(builtin('lagom:sill-inlagd'))).toEqual([])
    expect(ids(builtin('lagom:kaffe-bryggt'))).toEqual(['koffein'])
    expect(ids(builtin('lagom:kaffe-koffeinfritt'))).toEqual([])
    expect(ids(builtin('lagom:vin-rott'))).toEqual(['alkohol'])
    expect(ids(builtin('lagom:ol-alkoholfri'))).toEqual(['alkoholfritt'])
    expect(ids(builtin('lagom:orte-bryggt'))).toEqual(['ortte'])
    expect(ids(builtin('lagom:sushi-blandad'))).toEqual(['sushi'])
    // Vegetarisk sushi har ingen fisk.
    expect(ids(food('Sushi veg.', 'snabbmat'))).toEqual([])
  })

  it('INGA råd för leverpastej, hårdost, smältost, ädelost på tub, fetaost och cream cheese', () => {
    const fine = [
      builtin('lagom:leverpastej'),
      builtin('lagom:leverpastej-latt'),
      builtin('lagom:smorgas-leverpastej'),
      food('Leverpastej bredbar fett ca 24 %', 'chark', { lmvNumber: 1474 }),
      food('Leverkorv', 'chark'),
      builtin('lagom:greve-28'),
      builtin('lagom:hushallsost-26'),
      food('Ost hårdost 28 %', 'ost'),
      builtin('lagom:smaltost-skivor'),
      builtin('lagom:mjukost-naturell'),
      food('Ädelost på tub', 'ost'),
      food('Mjukost ädelost 22 % tub', 'ost'),
      builtin('lagom:fetaost'),
      builtin('lagom:farskost-naturell'),
      food('Färskost cream cheese fett 27 %', 'ost', { lmvNumber: 107 }),
      food('Cream cheese av pastöriserad mjölk', 'ost'),
      food('Mozzarella', 'ost'),
      food('Halloumi', 'ost'),
      builtin('lagom:paneer'),
      food('Pizza med gorgonzola', 'snabbmat'),
      food('Vitmögelost camembert friterad', 'ost'),
      builtin('lagom:skinkpaj'),
      builtin('lagom:toast-skinka-ost'),
      builtin('lagom:banan'),
    ]
    for (const f of fine) expect([f.name, ids(f)]).toEqual([f.name, []])
  })

  it('texterna är råd som slutar med källan och har granskningsdatum', () => {
    for (const r of [...PREGNANCY_RULES, ...BREASTFEEDING_RULES]) {
      expect(r.text.endsWith('Källa: Livsmedelsverket')).toBe(true)
      expect(r.source).toMatch(/^https:\/\/www\.livsmedelsverket\.se\/matvanor-halsa--miljo\/kostrad\//)
      expect(r.reviewed).toMatch(/^2026-06-\d\d$/)
      // Aldrig förbud eller skuld.
      expect(r.text).not.toMatch(/förbjud|farligt att äta|får inte|skäms/i)
    }
    expect(PREGNANCY_RULES.every((r) => r.reviewed === '2026-06-15')).toBe(true)
  })
})

describe('pregnancyNotes – ammar och övriga', () => {
  it('ammande får Livsmedelsverkets råd för ammande', () => {
    expect(ids(builtin('lagom:farsk-tonfisk'), 'ammar')).toEqual(['kvicksilver'])
    expect(ids(builtin('lagom:tonfisk-vatten'), 'ammar')).toEqual(['tonfisk-burk'])
    expect(ids(builtin('lagom:stromming'), 'ammar')).toEqual(['dioxin'])
    expect(ids(builtin('lagom:vin-rott'), 'ammar')).toEqual(['alkohol'])
    expect(ids(food('Fänkålste', 'dryck'), 'ammar')).toEqual(['fankal-anis'])
    expect(ids(builtin('lagom:orte-bryggt'), 'ammar')).toEqual(['ortte'])
    // Kaffe går bra när man ammar, liksom mögelost och gravad lax.
    expect(ids(builtin('lagom:kaffe-bryggt'), 'ammar')).toEqual([])
    expect(ids(builtin('lagom:brie'), 'ammar')).toEqual([])
    expect(ids(builtin('lagom:lax-gravad'), 'ammar')).toEqual([])
    expect(ids(builtin('lagom:kalvlever-stekt'), 'ammar')).toEqual([])
  })

  it('inga råd utan graviditet eller amning', () => {
    expect(pregnancyNotes(builtin('lagom:brie'), 'ingen')).toEqual([])
    expect(pregnancyNotes(builtin('lagom:brie'), undefined)).toEqual([])
  })

  it('rubriken följer livsfasen', () => {
    expect(pregnancyNoteTitle('gravid')).toBe('Bra att veta när du är gravid')
    expect(pregnancyNoteTitle('ammar')).toBe('Bra att veta när du ammar')
  })
})
