/*
 * Övergången till uppdateringsfrågan (registerType 'prompt' i vite.config.ts).
 *
 * Fram till version 1.0 byggdes service workern med autoUpdate: en ny version tog över direkt.
 * Den nya väntar i stället tills användaren trycker på "Uppdatera" (UpdatePrompt). Men sidor från
 * den gamla versionen har ingen sådan fråga – utan det här skriptet skulle den nya versionen vänta
 * tills alla flikar och hemskärmsappar har stängts, och så länge visas gamla priser och texter.
 *
 * Därför: när den nya service workern installeras och den aktiva är en gammal (ingen markering i
 * cachen) tar den över direkt, som förut. Den gamla sidan laddas då om av sin egen autoUpdate-kod.
 * Därefter finns markeringen, och nästa version väntar på användarens "Uppdatera".
 *
 * Laddas med importScripts i den genererade sw.js (workbox.importScripts i vite.config.ts).
 */
/* global self, caches, Response */
;(function () {
  var CACHE = 'lagom-sw-meta'
  var MARKER = './__lagom-uppdateringsfraga'

  function hasMarker() {
    return caches
      .open(CACHE)
      .then(function (cache) {
        return cache.match(MARKER)
      })
      .then(function (res) {
        return Boolean(res)
      })
      .catch(function () {
        return true
      })
  }

  self.addEventListener('install', function (event) {
    event.waitUntil(
      hasMarker().then(function (marked) {
        // Ingen aktiv service worker, eller en från tiden före uppdateringsfrågan: ta över direkt.
        if (!self.registration.active || !marked) return self.skipWaiting()
        return undefined
      }),
    )
  })

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches
        .open(CACHE)
        .then(function (cache) {
          return cache.put(MARKER, new Response('1'))
        })
        .catch(function () {
          /* utan markering tar nästa version över direkt – ingen skada */
        }),
    )
  })
})()
