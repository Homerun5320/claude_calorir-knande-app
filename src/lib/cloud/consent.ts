/**
 * Samtycket till Lagom Moln (artikel 9.2 a GDPR – uttryckligt samtycke till behandling av
 * hälsouppgifter). Texten visas bredvid en kryssruta som aldrig är förifylld, och versionen sparas
 * i valvet (consent_version, consent_at).
 *
 * Ändras texten i sak: höj `CLOUD_CONSENT_VERSION`. Då får alla som redan använder Lagom Moln
 * godkänna den nya texten innan nästa uppladdning. Se docs/DPIA-SYNK.md.
 */

/** Versionen av samtyckestexten (datum då texten fastställdes). */
export const CLOUD_CONSENT_VERSION = '2026-10-01'

/** Samtyckestexten, ordagrant. */
export const CLOUD_CONSENT_TEXT =
  'Jag samtycker till att min dagbok, vikt och mina mått lagras krypterat hos Lagoms molntjänst för att jag ska kunna återställa dem. Bara jag har nyckeln. Jag kan när som helst stänga av och radera.'
