/**
 * En liten läsare för Xcodes projektfil (`ios/App/App.xcodeproj/project.pbxproj`), som är en
 * egenskapslista i det gamla OpenStep/ASCII-formatet:
 *
 *   // !$*UTF8*$!
 *   {
 *     archiveVersion = 1;
 *     objects = {
 *       504EC3031FED79650016851F /* App *\/ = { isa = PBXNativeTarget; buildPhases = ( … ); };
 *     };
 *   }
 *
 * - Kommentarer: `/* … *\/` och `// …` (till radens slut) hoppas över.
 * - Text: citerad ("…" eller '…', med \n, \t, \", \\, \Uxxxx och oktala \ooo) eller ociterad
 *   (bokstäver, siffror och t.ex. `_ $ / : . - +` – allt utom blanktecken och `{ } ( ) = ; , " '`).
 * - Ordböcker `{ nyckel = värde; }` blir vanliga objekt och listor `( a, b, )` arrayer.
 *   Alla värden är text (tal skrivs som text även av Xcode), inga typer gissas.
 * - En nyckel som förekommer två gånger i samma ordbok är ett fel – två objekt med samma id i
 *   `objects` skulle annars tyst skriva över varandra.
 *
 * Läsaren används av scripts/ios-widget.mjs och testerna (netlify/tests/ios-widget.test.ts). Den
 * skriver aldrig filen: ändringar görs som text, så att allt annat i filen står kvar tecken för tecken.
 */

export class PbxprojError extends Error {
  /**
   * @param {string} message
   * @param {number} line
   * @param {number} column
   */
  constructor(message, line, column) {
    super(`project.pbxproj rad ${line}, kolumn ${column}: ${message}`)
    this.name = 'PbxprojError'
    this.line = line
    this.column = column
  }
}

/** Tecken som avslutar en ociterad text. */
const DELIMITERS = new Set(['{', '}', '(', ')', '=', ';', ',', '"', "'"])

const SIMPLE_ESCAPES = /** @type {Record<string, string>} */ ({
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '"': '"',
  "'": "'",
  '\\': '\\',
  '\n': '\n',
})

/**
 * Sätt en egenskap utan att röra prototypen (en nyckel som heter `__proto__` blir en vanlig nyckel).
 * @param {Record<string, unknown>} obj
 * @param {string} key
 * @param {unknown} value
 */
function define(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true })
}

/**
 * Tolka texten i en project.pbxproj. Returnerar rotordboken som ett vanligt objekt (med
 * `objects`, `rootObject` …). Kastar `PbxprojError` med rad och kolumn vid fel.
 * @param {string} text
 * @returns {Record<string, any>}
 */
export function parsePbxproj(text) {
  if (typeof text !== 'string') throw new TypeError('parsePbxproj: texten saknas')
  let pos = 0
  // En BOM i början hoppas över.
  if (text.charCodeAt(0) === 0xfeff) pos = 1

  /** @param {number} at */
  function location(at) {
    let line = 1
    let column = 1
    for (let i = 0; i < at && i < text.length; i++) {
      if (text[i] === '\n') {
        line++
        column = 1
      } else column++
    }
    return { line, column }
  }

  /**
   * @param {string} message
   * @param {number} [at]
   * @returns {never}
   */
  function fail(message, at = pos) {
    const { line, column } = location(at)
    throw new PbxprojError(message, line, column)
  }

  /** Hoppa över blanktecken och kommentarer. */
  function skip() {
    while (pos < text.length) {
      const c = text[pos]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') {
        pos++
      } else if (c === '/' && text[pos + 1] === '*') {
        const end = text.indexOf('*/', pos + 2)
        if (end === -1) fail('kommentaren /* avslutas aldrig')
        pos = end + 2
      } else if (c === '/' && text[pos + 1] === '/') {
        const end = text.indexOf('\n', pos + 2)
        pos = end === -1 ? text.length : end + 1
      } else {
        break
      }
    }
  }

  /** @param {string} ch */
  function expect(ch) {
    skip()
    if (text[pos] !== ch) {
      fail(pos >= text.length ? `väntade "${ch}" men filen tog slut` : `väntade "${ch}" men hittade "${text[pos]}"`)
    }
    pos++
  }

  /** @returns {string} */
  function parseQuoted() {
    const quote = text[pos]
    const start = pos
    pos++
    let out = ''
    while (true) {
      if (pos >= text.length) fail('citerad text avslutas aldrig', start)
      const c = text[pos]
      if (c === quote) {
        pos++
        return out
      }
      if (c !== '\\') {
        out += c
        pos++
        continue
      }
      const next = text[pos + 1]
      if (next === undefined) fail('citerad text avslutas aldrig', start)
      if (next === 'U' || next === 'u') {
        const hex = text.slice(pos + 2, pos + 6)
        if (!/^[0-9A-Fa-f]{4}$/.test(hex)) fail('ogiltig \\U-sekvens i citerad text')
        out += String.fromCharCode(parseInt(hex, 16))
        pos += 6
      } else if (next >= '0' && next <= '7') {
        const oct = /^[0-7]{1,3}/.exec(text.slice(pos + 1, pos + 4))?.[0] ?? next
        out += String.fromCharCode(parseInt(oct, 8))
        pos += 1 + oct.length
      } else if (Object.hasOwn(SIMPLE_ESCAPES, next)) {
        out += SIMPLE_ESCAPES[next]
        pos += 2
      } else {
        // Okänd sekvens: tecknet självt (som Apples läsare).
        out += next
        pos += 2
      }
    }
  }

  /** @returns {string} */
  function parseUnquoted() {
    const start = pos
    while (pos < text.length) {
      const c = text[pos]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || DELIMITERS.has(c)) break
      if (c === '/' && (text[pos + 1] === '*' || text[pos + 1] === '/')) break
      pos++
    }
    if (pos === start) fail(pos >= text.length ? 'filen tog slut mitt i ett värde' : `oväntat tecken "${text[pos]}"`)
    return text.slice(start, pos)
  }

  /** @returns {string} */
  function parseString() {
    skip()
    const c = text[pos]
    return c === '"' || c === "'" ? parseQuoted() : parseUnquoted()
  }

  /** @returns {Record<string, unknown>} */
  function parseDict() {
    expect('{')
    /** @type {Record<string, unknown>} */
    const obj = {}
    while (true) {
      skip()
      if (pos >= text.length) fail('ordboken { avslutas aldrig')
      if (text[pos] === '}') {
        pos++
        return obj
      }
      const keyAt = pos
      const key = parseString()
      expect('=')
      const value = parseValue()
      expect(';')
      if (Object.hasOwn(obj, key)) fail(`nyckeln "${key}" förekommer två gånger`, keyAt)
      define(obj, key, value)
    }
  }

  /** @returns {unknown[]} */
  function parseArray() {
    expect('(')
    /** @type {unknown[]} */
    const list = []
    while (true) {
      skip()
      if (pos >= text.length) fail('listan ( avslutas aldrig')
      if (text[pos] === ')') {
        pos++
        return list
      }
      list.push(parseValue())
      skip()
      if (text[pos] === ',') {
        pos++
      } else if (text[pos] !== ')') {
        fail(pos >= text.length ? 'listan ( avslutas aldrig' : `väntade "," eller ")" men hittade "${text[pos]}"`)
      }
    }
  }

  /** @returns {unknown} */
  function parseValue() {
    skip()
    const c = text[pos]
    if (c === '{') return parseDict()
    if (c === '(') return parseArray()
    if (c === undefined) fail('filen tog slut där ett värde väntades')
    return parseString()
  }

  skip()
  const root = parseDict()
  skip()
  if (pos < text.length) fail(`oväntad text efter projektets slut: "${text.slice(pos, pos + 20)}"`)
  return root
}

/** Ett objekt-id i Xcode-projekt: 24 hexsiffror (versaler). */
export const OBJECT_ID = /^[0-9A-F]{24}$/

/**
 * Projektets objekt (`objects`) som en lista med id.
 * @param {Record<string, any>} project
 * @returns {Array<{ id: string } & Record<string, any>>}
 */
export function pbxObjectList(project) {
  const objects = project?.objects
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) return []
  return Object.entries(objects).map(([id, obj]) => ({ ...obj, id }))
}
