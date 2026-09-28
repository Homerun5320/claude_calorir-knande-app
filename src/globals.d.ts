/**
 * Globala konstanter som Vite byter ut mot riktiga värden vid bygget.
 *
 * Värdena sätts i vite.config.ts via `define`:
 * - `__APP_VERSION__` – versionen i package.json, t.ex. "1.0.0".
 * - `__BUILD_ID__` – de första sju tecknen i commit-id:t (Netlifys COMMIT_REF), annars "lokal".
 *
 * I tester och verktyg där `define` saknas finns konstanterna inte alls – läs dem därför alltid
 * med `typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'`.
 */
declare const __APP_VERSION__: string
declare const __BUILD_ID__: string
