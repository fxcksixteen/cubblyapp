import Foundation
import UIKit
import Supabase

/// Receives the APNs device token from `AppDelegate` and upserts it into the
/// `apns_subscriptions` table so the backend's `send-apns-push` edge function
/// can deliver remote pushes to this device when the app is closed.
@MainActor
final class APNsRegistrar {
    static let shared = APNsRegistrar()
    private init() {}

    /// Cached token in case we receive it before the user is signed in.
    private var pendingToken: String?

    func handleDeviceToken(_ tokenData: Data) {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        pendingToken = token
        Task { await upsert(token: token) }
    }

    func handleRegistrationFailure(_ error: Error) {
        print("[APNs] registration failed:", error)
    }

    /// Called from `SessionStore` once the user signs in — flushes any token
    /// that arrived before auth completed.
    func flushIfNeeded() {
        guard let token = pendingToken else { return }
        Task { await upsert(token: token) }
    }

    private func upsert(token: String) async {
        let client = SupabaseManager.shared.client
        guard let user = try? await client.auth.user() else {
            // Will be retried via flushIfNeeded() after sign-in.
            return
        }

        // Sandbox vs production: `aps-environment=development` in the
        // entitlements file (debug + free dev builds + most TestFlight builds
        // built locally) → sandbox. App Store builds → production.
        // We can't reliably detect this at runtime, so we ship an entitlement
        // of `development` and the edge function tries sandbox first, then
        // production, on each send. The `environment` column is informational.
        #if DEBUG
        let env = "sandbox"
        #else
        let env = "production"
        #endif

        struct Row: Encodable {
            let user_id: String
            let device_token: String
            let bundle_id: String
            let environment: String
            let device_name: String?
            let app_version: String?
        }

        let row = Row(
            user_id: user.id.uuidString,
            device_token: token,
            bundle_id: Bundle.main.bundleIdentifier ?? "app.cubbly.ios",
            environment: env,
            device_name: UIDevice.current.name,
            app_version: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        )

        do {
            try await client
                .from("apns_subscriptions")
                .upsert(row, onConflict: "device_token")
                .execute()
            print("[APNs] token registered (\(env))")
        } catch {
            print("[APNs] upsert failed:", error)
        }
    }
}
