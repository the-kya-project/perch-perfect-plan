import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Must happen before launch finishes, or a notification tap that opens
        // the app from fully closed can be lost (see LaunchNotificationRelay).
        LaunchNotificationRelay.shared.install()
        return true
    }

    // The app uses scenes (UIApplicationSceneManifest in Info.plist), so the
    // window, link opens (custom scheme and universal links) and foreground /
    // background changes all go through SceneDelegate. iOS no longer calls the
    // app-level versions of those methods.

    // MARK: - Remote notifications (APNs)
    //
    // The Capacitor push plugin does NOT swizzle these. Without both callbacks
    // forwarding to the notification centre, `PushNotifications.register()`
    // resolves nothing at all: the JS `registration` event never fires and the
    // device silently ends up with no token. Required for native push. These
    // belong to the app, not a scene, so they stay here.

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications,
                                        object: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                        object: error)
    }

    // MARK: - Scenes

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
