import UIKit
import Capacitor

/**
 Appens egen bryggvy: registrerar appens lokala Capacitor-tillägg (inga npm-paket) när bryggan har
 skapats – före sidans första laddning, så att JS ser tilläggen direkt. `SceneDelegate` använder den
 i stället för `CAPBridgeViewController()`.

 - LagomWidget: hemskärmswidgeten, se LagomWidgetPlugin.swift och docs/WIDGET.md (används inte på
   iPhone förrän `WIDGET_IOS_READY` är true).
 */
class LagomBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(LagomWidgetPlugin())
    }
}
