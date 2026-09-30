#!/usr/bin/env node
/**
 * Skapar ett nytt nyckelpar (ECDSA P-256) för Lagoms licensnycklar.
 *
 *   node scripts/generate-license-keys.mjs          skriv ut nycklarna med instruktioner
 *   node scripts/generate-license-keys.mjs --json   { publicKey, privateKey } som JSON
 *
 * Den publika nyckeln (VITE_LICENSE_PUBLIC_KEY) byggs in i appen och kontrollerar licenser offline.
 * Den privata nyckeln (LICENSE_PRIVATE_KEY) signerar licenser i serverfunktionen och är HEMLIG.
 * Ingenting skrivs till disk. Se docs/BETALNING.md.
 */
import { webcrypto } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle

const toBase64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64')

/** Nytt nyckelpar: publik nyckel som SPKI och privat som PKCS#8, båda base64. */
export async function generateLicenseKeyPair() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return {
    publicKey: toBase64(await subtle.exportKey('spki', pair.publicKey)),
    privateKey: toBase64(await subtle.exportKey('pkcs8', pair.privateKey)),
  }
}

function instructions({ publicKey, privateKey }) {
  return `
Nytt nyckelpar för Lagoms licenser (ECDSA P-256)
================================================

1. PUBLIK NYCKEL – byggs in i appen och får vara offentlig.
   Lägg in den i Netlify (Site configuration → Environment variables) för byggen:

VITE_LICENSE_PUBLIC_KEY=${publicKey}

2. PRIVAT NYCKEL – HEMLIG. Den som har den kan skapa giltiga licenser.
   Lägg in den i Netlify för Functions och markera den som hemlig ("Contains secret values").
   Checka aldrig in den i git och skicka den aldrig i mejl, chatt eller ärenden.

LICENSE_PRIVATE_KEY=${privateKey}

Viktigt
- Spara den privata nyckeln säkert, t.ex. i en lösenordshanterare. Den sparas inte någon annanstans.
- Nycklarna hör ihop med appen: byter du nyckelpar slutar alla redan sålda licenser att fungera.
  Använd ett eget par för test (Stripes testläge) och skapa det skarpa paret en gång, precis
  innan du börjar sälja på riktigt. Byt det sedan aldrig.
- Kontrollera att paret hör ihop:
  LICENSE_PRIVATE_KEY=… VITE_LICENSE_PUBLIC_KEY=… node scripts/issue-license.mjs --plan ar --days 1
`
}

async function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Användning: node scripts/generate-license-keys.mjs [--json]')
    return
  }
  const keys = await generateLicenseKeyPair()
  if (args.includes('--json')) console.log(JSON.stringify(keys))
  else console.log(instructions(keys))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`Kunde inte skapa nycklar: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  })
}
