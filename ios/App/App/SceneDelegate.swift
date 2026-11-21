import UIKit
import UserNotifications
import Capacitor

// Capacitor 8.5's scene delegate (its template), plus two additions: handing the
// Capacitor bridge to LaunchNotificationRelay once it exists, and our own bridge
// view controller (AppBridgeViewController) for the DuoBridge plugin.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Built in code. Info.plist names no storyboard for the scene, so UIKit
        // doesn't build a second window (and a second web view) from Main.
        // AppBridgeViewController adds the local DuoBridge plugin (1.2).
        let bridgeViewController = AppBridgeViewController()
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = bridgeViewController
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // The bridge and its plugins are created when the view loads (normally
        // by makeKeyAndVisible above; loadViewIfNeeded makes sure).
        bridgeViewController.loadViewIfNeeded()
        LaunchNotificationRelay.shared.bridgeReady(bridgeViewController.bridge,
                                                   launchResponse: connectionOptions.notificationResponse)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
