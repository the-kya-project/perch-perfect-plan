import UIKit
import Capacitor

/// DuoBridge (app version 1.2): tells the web app about a foldable iPhone's
/// screen and fold, so it can put its navigation where the system wants it.
///
/// Sends one combined "duoChange" event whenever any of these change, and
/// answers getState() with the same shape:
///   verticalBarEdge    "left" | "right" | null  (UITraitCollection.verticalBarEdge:
///                      the cover screen, or the inner screen held sideways)
///   hingeStatus        "closed" | "partiallyOpen" | "fullyOpen" | null
///   hingeAngleDegrees  number | null
///   fold               { x, y, width, height, active } in web (CSS) points, or null
///                      (the web view's .division reserved region: the crease)
///
/// Everything is null on devices without a hinge and before iOS 27.1, where the
/// APIs don't exist; the web app then keeps its own space-based rule
/// (src/lib/duo.ts). Hinge angle updates are capped at about 10 a second.
@objc(DuoBridgePlugin)
public class DuoBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DuoBridgePlugin"
    public let jsName = "DuoBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]

    struct Fold: Equatable {
        var x: Double
        var y: Double
        var width: Double
        var height: Double
        var active: Bool
    }

    struct State: Equatable {
        var verticalBarEdge: String?
        var hingeStatus: String?
        var hingeAngleDegrees: Double?
        var fold: Fold?

        /// Only the angle differs: the one change that's throttled.
        func differsOnlyInAngle(from other: State) -> Bool {
            var a = self, b = other
            a.hingeAngleDegrees = nil
            b.hingeAngleDegrees = nil
            return a == b && hingeAngleDegrees != other.hingeAngleDegrees
        }

        var payload: [String: Any] {
            [
                "verticalBarEdge": verticalBarEdge ?? NSNull(),
                "hingeStatus": hingeStatus ?? NSNull(),
                "hingeAngleDegrees": hingeAngleDegrees ?? NSNull(),
                "fold": fold.map { ["x": $0.x, "y": $0.y, "width": $0.width, "height": $0.height, "active": $0.active] as [String: Any] } ?? NSNull(),
            ]
        }
    }

    /// The latest values (main thread only).
    private var state = State()
    private var lastSent: State?
    private var lastSentAt: CFTimeInterval = 0
    private var pendingSend: DispatchWorkItem?
    private static let angleInterval: CFTimeInterval = 0.1
    /// The last hinge reading: nil until one arrives, and on hardware without a hinge.
    private var hinge: (status: String, degrees: Double)?
    private var started = false
    // Kept untyped: the types only exist on iOS 27.1+, the app runs on iOS 15+.
    private var hingeInteraction: AnyObject?
    private var traitRegistration: Any?

    override public func load() {
        Task { @MainActor in self.start() }
    }

    @MainActor
    private func start() {
        guard #available(iOS 27.1, *), !started,
              let webView = bridge?.webView, let viewController = bridge?.viewController else { return }
        started = true
        let interaction = UIHingeInteraction { [weak self] _, update in
            guard let self else { return }
            // nil: this hierarchy has no hinge (any non-foldable device).
            if let h = update.hinge {
                self.hinge = (Self.statusName(h.status), (Double(h.angle) * 180 / .pi * 10).rounded() / 10)
            } else {
                self.hinge = nil
            }
            self.refresh()
        }
        webView.addInteraction(interaction)
        hingeInteraction = interaction
        traitRegistration = viewController.registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) { [weak self] (_: UIViewController, _: UITraitCollection) in
            self?.refresh()
        }
        refresh()
    }

    /// Re-reads the edge, hinge and fold and sends them if anything changed.
    /// Called on hinge updates, trait changes, and every layout of the bridge
    /// view controller (the fold region moves when the screen rotates).
    @MainActor @objc public func refresh() {
        guard #available(iOS 27.1, *), started,
              let webView = bridge?.webView, let viewController = bridge?.viewController else { return }
        let next = State(
            verticalBarEdge: Self.edgeName(viewController),
            hingeStatus: hinge?.status,
            hingeAngleDegrees: hinge?.degrees,
            fold: Self.fold(in: webView)
        )
        guard next != state else { return }
        let angleOnly = next.differsOnlyInAngle(from: state)
        state = next
        send(throttled: angleOnly)
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.state.payload) }
    }

    // MARK: - Sending

    /// Edge, status and fold changes go out at once; angle-only changes at most
    /// every 0.1s, with the latest value sent when the wait ends.
    private func send(throttled: Bool) {
        pendingSend?.cancel()
        pendingSend = nil
        let wait = Self.angleInterval - (CACurrentMediaTime() - lastSentAt)
        if throttled && wait > 0 {
            let item = DispatchWorkItem { [weak self] in self?.emit() }
            pendingSend = item
            DispatchQueue.main.asyncAfter(deadline: .now() + wait, execute: item)
            return
        }
        emit()
    }

    private func emit() {
        pendingSend = nil
        lastSentAt = CACurrentMediaTime()
        guard state != lastSent else { return }
        lastSent = state
        notifyListeners("duoChange", data: state.payload)
    }

    // MARK: - Reading the system (iOS 27.1+)

    @available(iOS 27.1, *)
    private static func statusName(_ status: UIHinge.Status) -> String {
        switch status {
        case .closed: return "closed"
        case .partiallyOpen: return "partiallyOpen"
        // .unknown is treated as fully open: nothing suggests otherwise.
        default: return "fullyOpen"
        }
    }

    /// The system's vertical bar edge as a physical side. UIKit reports leading
    /// or trailing; the web layout is left-to-right whatever the language, so
    /// map them through the view's layout direction.
    @MainActor @available(iOS 27.1, *)
    private static func edgeName(_ viewController: UIViewController) -> String? {
        let rtl = viewController.view.effectiveUserInterfaceLayoutDirection == .rightToLeft
        switch viewController.traitCollection.verticalBarEdge {
        case .leading: return rtl ? "right" : "left"
        case .trailing: return rtl ? "left" : "right"
        default: return nil
        }
    }

    /// The crease as a division region of the web view. The web view isn't
    /// zoomed, so its points are the page's CSS pixels.
    @MainActor @available(iOS 27.1, *)
    private static func fold(in webView: UIView) -> Fold? {
        guard let region = webView.reservedRegions(kind: .division, options: .includeInactive).first else { return nil }
        let f = region.frame
        return Fold(x: Double(f.minX), y: Double(f.minY), width: Double(f.width), height: Double(f.height), active: region.isActive)
    }
}
