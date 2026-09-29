/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/keyboard" />
/// <reference types="@capacitor/status-bar" />
/// <reference types="@capacitor/local-notifications" />
/**
 * Capacitor – de inbyggda apparna för App Store (iPhone) och Google Play (Android).
 *
 * Webbdelen byggs med `VITE_DISTRIBUTION=appstore|play npx vite build` till `dist-native/` och
 * kopieras in i apparna med `npx cap sync` (se "Plattform och butiker" i CLAUDE.md och
 * docs/NATIVE.md). Webbversionen (`dist/`) påverkas inte av den här filen.
 *
 * OBS – ändra aldrig efter första uppladdningen till App Store Connect eller Play Console:
 * - `appId` (Bundle ID i App Store, applicationId i Google Play) – ägaren bekräftar det före
 *   första uppladdningen, se docs/NATIVE.md.
 * - Webbvyns ursprung (`capacitor://localhost` på iPhone, `https://localhost` på Android).
 *   Dagboken ligger i webbvyns IndexedDB, som hör till ursprunget – byts `server.hostname`,
 *   `server.iosScheme` eller `server.androidScheme` försvinner all sparad data i appen.
 *   Serverfunktionerna godtar just de här ursprungen (ALLOWED_NATIVE_ORIGINS i netlify/lib/config.ts).
 */
import type { CapacitorConfig } from '@capacitor/cli'
import type { KeyboardResize } from '@capacitor/keyboard'

/** Granens gröna (--lg-gran) – ikonfärg för notiser på Android. */
const GRAN = '#1F5A43'

const config: CapacitorConfig = {
  appId: 'se.lagomappen.lagom',
  appName: 'Lagom',
  webDir: 'dist-native',
  // Loggar bara i felsökningsbyggen – aldrig livsmedel eller värden i telefonens systemlogg.
  loggingBehavior: 'debug',
  ios: {
    // Webbvyn går kant till kant; appen lägger själv marginaler med var(--sa-*) (viewport-fit=cover).
    contentInset: 'never',
    // Ingen förhandsvisning av länkar vid långt tryck – externa länkar öppnas i Safari.
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
    // Bakgrunden följer systemets ljusa/mörka läge (systemBackground) när den inte sätts här.
  },
  android: {
    // Blanda aldrig in http i https-sidan (cleartext är också avstängt i manifestet).
    allowMixedContent: false,
    // Tangentbordets inmatning går via webbvyns vanliga fält.
    captureInput: false,
  },
  server: {
    // Standardvärdena skrivs ut för tydlighet – se varningen överst.
    hostname: 'localhost',
    iosScheme: 'capacitor',
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SystemBars: {
      // Android: sätter --safe-area-inset-* (som var(--sa-*) i src/index.css läser) även i äldre
      // webbvyer där env(safe-area-inset-*) inte ger rätt värde kant till kant.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DEFAULT',
    },
    SplashScreen: {
      // Startskärmen döljs av appen när dagboken har lästs in (`hideSplash()` i src/native/system.ts,
      // via initNative i AppShell). Döljs den inte inom 3 s gör den det själv – en reserv ifall
      // skriptet aldrig startar.
      launchShowDuration: 3000,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      // Ingen backgroundColor här: startskärmens bild och färg (ljus #F6F3EC, mörk #0B1210) ligger i
      // apparnas resurser och följer telefonens ljusa/mörka läge (scripts/generate-native-assets.mjs).
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    Keyboard: {
      // iPhone: webbvyn krymper när tangentbordet visas, så att fältet och knapparna syns.
      resize: 'native' as KeyboardResize,
      // iPhone: bakgrunden bakom tangentbordet följer sidans bakgrund (ljust/mörkt).
      autoBackdropColor: 'dom',
    },
    StatusBar: {
      // Statusfältet ligger över webbvyn (kant till kant); stilen följer ljust/mörkt läge.
      overlaysWebView: true,
      style: 'DEFAULT',
    },
    LocalNotifications: {
      // Notisikonen på Android (vit siluett, android/app/src/main/res/drawable*/ic_stat_lagom.png).
      smallIcon: 'ic_stat_lagom',
      iconColor: GRAN,
    },
  },
}

export default config
