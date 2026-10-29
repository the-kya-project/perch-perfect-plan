import UIKit
import UserNotifications
import Capacitor

/// Makes a notification tap that opens the app from fully closed land on the
/// right page.
///
/// Capacitor's bridge makes its NotificationRouter the notification delegate
/// when the bridge is created. Under the scene lifecycle that is in
/// SceneDelegate, after launch has finished, but iOS expects the delegate to be
/// set before launch finishes and can hand the launching tap over before the
/// bridge exists. So this relay is the delegate from the start (AppDelegate),
/// holds a tap that arrives early, and passes it to the bridge's router once
/// SceneDelegate has built it. The push plugin then keeps the event until the
/// web app's listener attaches (`retainUntilConsumed`), and the web app opens
/// the notification's page as it does for any tap.
///
/// The tap can also arrive in the scene's launch options instead of (or as
/// well as) the delegate call, so both are accepted and each tap is passed on
/// once. To keep that guarantee the relay stays the delegate for good and
/// forwards everything else unchanged.
final class LaunchNotificationRelay: NSObject, UNUserNotificationCenterDelegate {
    static let shared = LaunchNotificationRelay()

    private weak var router: NotificationRouter?
    private var pending: [UNNotificationResponse] = []
    /// Taps already passed on, so one tap arriving both ways counts once.
    private var delivered: [String] = []

    /// AppDelegate, in didFinishLaunching.
    func install() {
        UNUserNotificationCenter.current().delegate = self
    }

    /// SceneDelegate, once the bridge (and the push plugin) exist.
    func bridgeReady(_ bridge: CAPBridgeProtocol?, launchResponse: UNNotificationResponse?) {
        guard let router = bridge?.notificationRouter else { return }
        self.router = router
        // The bridge just made its router the delegate; take that back so every
        // tap still passes through here (the router gets them all regardless).
        UNUserNotificationCenter.current().delegate = self

        if let launchResponse = launchResponse {
            pending.append(launchResponse)
        }
        let waiting = pending
        pending = []
        for response in waiting {
            deliver(response, completion: {})
        }
    }

    private func key(_ response: UNNotificationResponse) -> String {
        return "\(response.notification.request.identifier)|\(response.notification.date.timeIntervalSince1970)|\(response.actionIdentifier)"
    }

    private func deliver(_ response: UNNotificationResponse, completion: @escaping () -> Void) {
        let id = key(response)
        guard let router = router, !delivered.contains(id) else {
            completion()
            return
        }
        delivered.append(id)
        if delivered.count > 20 { delivered.removeFirst() }
        router.userNotificationCenter(UNUserNotificationCenter.current(), didReceive: response, withCompletionHandler: completion)
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if router == nil {
            // Too early: keep it for bridgeReady. iOS only needs to hear that
            // it was received.
            if !pending.contains(where: { key($0) == key(response) }) {
                pending.append(response)
            }
            completionHandler()
            return
        }
        deliver(response, completion: completionHandler)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        guard let router = router else {
            completionHandler([])
            return
        }
        router.userNotificationCenter(center, willPresent: notification, withCompletionHandler: completionHandler)
    }
}
