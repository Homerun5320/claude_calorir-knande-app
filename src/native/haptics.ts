/**
 * Haptik i de inbyggda apparna – en lätt knack i handen när något lyckas. Laddas bara via
 * `loadNative('haptics')` (src/native/index.ts) och aldrig på webben.
 *
 * - `tap()`: en lätt stöt, för små val (ett glas vatten, en bock, ett reglage).
 * - `success()`: "klart", när något viktigare är gjort (loggat, fastan avslutad, köpet klart).
 *
 * Sparsamt, som animationerna: ingen haptik på webben, inte när telefonen har "Minska rörelse"
 * påslaget (`prefers-reduced-motion`) och aldrig vid fel eller varningar. Funktionerna väntar inte
 * på telefonen och kastar aldrig – går haptiken inte att använda loggas det en gång och sedan
 * händer ingenting.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { logError } from '../lib/errorLog'
import { isNative } from './index'

/** true när haptik får användas just nu: i appen och utan "Minska rörelse". */
export function hapticsAllowed(): boolean {
  if (!isNative()) return false
  try {
    return !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch {
    return true
  }
}

let reported = false

function run(effect: () => Promise<void>): void {
  if (!hapticsAllowed()) return
  const report = (error: unknown) => {
    // Bara första felet – annars skulle varje tryck fylla felloggen (högst 20 poster).
    if (reported) return
    reported = true
    logError(error, 'native:haptik')
  }
  try {
    void effect().catch(report)
  } catch (error) {
    report(error)
  }
}

/** En lätt stöt – för små val. No-op på webben och med "Minska rörelse". */
export function tap(): void {
  run(() => Haptics.impact({ style: ImpactStyle.Light }))
}

/** "Klart" – när något är gjort. No-op på webben och med "Minska rörelse". */
export function success(): void {
  run(() => Haptics.notification({ type: NotificationType.Success }))
}

/** Endast för tester. */
export function resetHapticsForTests(): void {
  reported = false
}
