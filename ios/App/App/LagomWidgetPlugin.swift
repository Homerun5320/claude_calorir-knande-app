import Foundation
import Capacitor
import WidgetKit

/**
 Det lokala Capacitor-tillägget "LagomWidget" i iPhone-appen (inget npm-paket) – samma kontrakt som
 Android-appens `widget/LagomWidgetPlugin.java` (docs/WIDGET.md §3). Registreras av
 `LagomBridgeViewController`. Webbdelen når det bara via src/native/widget.ts.

 **Används inte ännu:** tillägget kompileras in i appen, men JS anropar det på iPhone först när
 `WIDGET_IOS_READY` är true, och det behöver App Group "group.se.lagomappen.lagom" i appens
 behörigheter (`node scripts/ios-widget.mjs enable`, docs/WIDGET.md §8). Utan App Group avvisas
 `update` med STORAGE och `clear` har inget att ta bort.

 - `update({ data })`: `data` är JSON-texten för widgetdata version 1, högst
   `LagomWidgetShared.maxChars` UTF-16-enheter (samma räkning som JS och Java). Datan kontrolleras
   med `WidgetPayload.parse` – samma regler som på Android. Ogiltig eller för stor data avvisas med
   `call.reject`, och den förra datan ligger då kvar. Annars sparas texten i App Groupens
   UserDefaults (nyckeln "payload") och widgetens tidslinje laddas om.
 - `clear()`: tar bort den sparade datan och laddar om tidslinjen (widgeten visar då läget utan
   data).

 Capacitor kör tilläggens metoder på bryggans egen kö (inte huvudtråden); omladdningen av widgeten
 skickas till huvudtråden. Inget här citerar datan: alla fel blir `call.reject` med en fast text och
 en felkod (INVALID, TOO_LARGE, STORAGE eller FAILED), och loggen får bara fasta texter.
 */
@objc(LagomWidgetPlugin)
public class LagomWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LagomWidgetPlugin"
    public let jsName = "LagomWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        guard let data = call.getString("data") else {
            call.reject("Widgetdata saknas", "INVALID")
            return
        }
        if data.utf16.count > LagomWidgetShared.maxChars {
            call.reject("Widgetdatan är för stor", "TOO_LARGE")
            return
        }
        do {
            _ = try WidgetPayload.parse(data)
        } catch WidgetPayloadError.tooLarge {
            call.reject("Widgetdatan är för stor", "TOO_LARGE")
            return
        } catch WidgetPayloadError.invalid(let message) {
            // Meddelandet är en fast text (WidgetPayload citerar aldrig datan).
            call.reject(message, "INVALID")
            return
        } catch {
            // Felet loggas inte – det kan innehålla delar av datan.
            LagomWidgetPlugin.log("Widgetdatan kunde inte tas emot")
            call.reject("Widgeten kunde inte uppdateras", "FAILED")
            return
        }
        guard let defaults = LagomWidgetShared.sharedDefaults() else {
            LagomWidgetPlugin.log("App Group saknas – widgetdatan sparas inte")
            call.reject("Widgetdatan kunde inte sparas", "STORAGE")
            return
        }
        defaults.set(data, forKey: LagomWidgetShared.payloadKey)
        LagomWidgetPlugin.reloadWidgets()
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard let defaults = LagomWidgetShared.sharedDefaults() else {
            // Utan App Group kan inget ha sparats – det finns inget att ta bort.
            call.resolve()
            return
        }
        defaults.removeObject(forKey: LagomWidgetShared.payloadKey)
        LagomWidgetPlugin.reloadWidgets()
        call.resolve()
    }

    /// Be WidgetKit rita om Lagoms widgetar (på huvudtråden; gör ingenting om ingen är placerad).
    private static func reloadWidgets() {
        DispatchQueue.main.async {
            WidgetCenter.shared.reloadTimelines(ofKind: LagomWidgetShared.kind)
        }
    }

    /// En fast rad i Xcodes logg – aldrig innehållet i datan.
    private static func log(_ message: String) {
        CAPLog.print("⚡️  LagomWidget: \(message)")
    }
}
