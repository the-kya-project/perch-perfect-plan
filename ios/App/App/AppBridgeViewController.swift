import UIKit
import Capacitor

/// The app's Capacitor bridge view controller: Capacitor's own, plus the local
/// DuoBridge plugin (registered here because local plugins aren't found by
/// Capacitor's package scan) and a nudge to it on every layout, when the
/// fold's position can change.
class AppBridgeViewController: CAPBridgeViewController {
    private let duoBridge = DuoBridgePlugin()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(duoBridge)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        duoBridge.refresh()
    }
}
