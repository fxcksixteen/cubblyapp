import Foundation
import UserNotifications
import UIKit

/// Local notification + permission manager. Equivalent to `src/lib/notifications.ts`
/// from the web/desktop app — shows in-app/foreground banners for incoming
/// messages while the app is alive, and respects the user's preferences.
///
/// For notifications when the app is **closed**, see `APNsRegistrar`, which
/// registers the device with Apple Push and stores the token in
/// `apns_subscriptions` for the `send-apns-push` edge function to deliver to.
@MainActor
final class NotificationService: NSObject, ObservableObject {
    static let shared = NotificationService()

    @Published private(set) var permissionGranted: Bool = false

    /// Conversation ID currently visible on screen. We suppress in-app banners
    /// for messages that arrive in the chat the user is already reading.
    var activeConversationID: UUID?

    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
        Task { await refreshPermission() }
    }

    /// If the user has already granted permission previously, make sure we
    /// (re-)register for remote notifications so APNs hands us a device token.
    /// This must run on every cold launch — without it, devices that
    /// authorized notifications in a previous session never re-register and
    /// the `apns_subscriptions` row is never written.
    func registerForRemoteIfAuthorized() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let granted = settings.authorizationStatus == .authorized
                   || settings.authorizationStatus == .provisional
        permissionGranted = granted
        if granted {
            await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    // MARK: - Permission

    /// Asks the OS for notification permission if not yet decided. Safe to call
    /// repeatedly. Returns true if granted.
    @discardableResult
    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            permissionGranted = granted
            // Register for remote notifications regardless — if the user
            // previously granted permission and we're being called again,
            // requestAuthorization returns true immediately without prompting.
            // We always want APNs to hand us a token on every launch.
            if granted {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
            return granted
        } catch {
            print("[Notifications] permission request failed:", error)
            return false
        }
    }

    func refreshPermission() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        permissionGranted = (settings.authorizationStatus == .authorized
                             || settings.authorizationStatus == .provisional)
    }

    // MARK: - Local banner for incoming message

    /// Shows a local notification for an incoming message. No-op if the user
    /// is currently reading that same conversation, the app is foregrounded
    /// AND focused on that chat, or the user disabled banners.
    func notifyIncomingMessage(
        conversationID: UUID,
        title: String,
        body: String,
        threadID: String? = nil
    ) {
        let prefs = NotificationPreferences.shared
        guard prefs.bannersEnabled else { return }
        // Skip if this is the conversation the user is actively viewing AND
        // the app is in the foreground — they can already see it.
        if activeConversationID == conversationID
            && UIApplication.shared.applicationState == .active {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = prefs.showMessagePreview ? body : "New message"
        content.sound = nil // we handle our own sound via SoundService for in-app dings.
        content.threadIdentifier = threadID ?? "dm:\(conversationID.uuidString)"
        content.userInfo = [
            "conversation_id": conversationID.uuidString,
        ]

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil // deliver immediately
        )
        UNUserNotificationCenter.current().add(request) { err in
            if let err { print("[Notifications] add failed:", err) }
        }
    }
}

extension NotificationService: UNUserNotificationCenterDelegate {
    /// Show banners even when the app is in the foreground (matches desktop UX).
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list])
    }

    /// User tapped a notification — TODO: wire up deep-linking to the chat.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        if let convID = info["conversation_id"] as? String {
            // Post a notification — RootView/MainTabView can listen and route.
            NotificationCenter.default.post(
                name: .cubblyOpenConversation,
                object: nil,
                userInfo: ["conversation_id": convID]
            )
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let cubblyOpenConversation = Notification.Name("cubbly.openConversation")
}
