import Foundation
import UIKit
import Supabase

/// Registers this device in `user_sessions` and keeps its `last_seen_at`
/// fresh, exactly like `src/lib/sessionTracker.ts` does on web/desktop.
///
/// This is what makes an iOS user count as **online** to everyone else: the
/// `online_user_ids()` RPC unions `profiles.last_seen_at` with
/// `user_sessions.last_seen_at`, and `presence_heartbeat()` only touches a row
/// when it's given a `_session_key`. iOS previously called the heartbeat with
/// no key at all, so it never wrote anything and peers on web/desktop saw the
/// phone as offline.
@MainActor
final class SessionTracker {
    static let shared = SessionTracker()

    private static let storageKey = "cubbly:session-id"

    private(set) var sessionKey: String = ""
    private var userId: UUID?

    private init() {}

    /// Stable per-install identifier, persisted across launches.
    static func currentSessionKey() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: storageKey), !existing.isEmpty {
            return existing
        }
        let fresh = UUID().uuidString.lowercased()
        defaults.set(fresh, forKey: storageKey)
        return fresh
    }

    private func deviceLabel() -> String {
        let model = UIDevice.current.model            // "iPhone" / "iPad"
        let name = UIDevice.current.name              // user's device name
        let version = UIDevice.current.systemVersion
        if !name.isEmpty && name != model {
            return "Cubbly for iOS on \(name)"
        }
        return "Cubbly for iOS on \(model) (iOS \(version))"
    }

    private func userAgent() -> String {
        let appVersion = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0"
        return "CubblyiOS/\(appVersion) (\(UIDevice.current.model); iOS \(UIDevice.current.systemVersion))"
    }

    func register(userID: UUID) async {
        userId = userID
        sessionKey = Self.currentSessionKey()

        struct SessionRow: Encodable {
            let user_id: String
            let session_key: String
            let device_label: String
            let user_agent: String
            let platform: String
            let is_desktop_app: Bool
            let is_mobile: Bool
            let last_seen_at: String
            let revoked_at: String?
        }

        let row = SessionRow(
            user_id: userID.uuidString,
            session_key: sessionKey,
            device_label: deviceLabel(),
            user_agent: userAgent(),
            platform: "iOS",
            is_desktop_app: false,
            is_mobile: true,
            last_seen_at: ISO8601DateFormatter().string(from: Date()),
            revoked_at: nil
        )

        do {
            try await SupabaseManager.shared.client
                .from("user_sessions")
                .upsert(row, onConflict: "user_id,session_key")
                .execute()
        } catch {
            print("[SessionTracker] register failed:", error)
        }

        await heartbeat()
    }

    /// Bumps this device's `last_seen_at`. Safe to call on a timer.
    func heartbeat() async {
        guard !sessionKey.isEmpty else { return }
        struct Params: Encodable { let _session_key: String }
        _ = try? await SupabaseManager.shared.client
            .rpc("presence_heartbeat", params: Params(_session_key: sessionKey))
            .execute()
    }

    /// Called on sign-out so the device stops counting as online right away.
    func unregister() async {
        guard let uid = userId, !sessionKey.isEmpty else { return }
        _ = try? await SupabaseManager.shared.client
            .from("user_sessions")
            .delete()
            .eq("user_id", value: uid.uuidString)
            .eq("session_key", value: sessionKey)
            .execute()
        userId = nil
    }
}
