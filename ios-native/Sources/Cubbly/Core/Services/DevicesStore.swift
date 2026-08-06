import Foundation
import Combine
import Supabase

/// Reads the signed-in user's active `user_sessions` rows so the Devices tab
/// can list every place Cubbly is open and revoke the ones you don't want.
@MainActor
final class DevicesStore: ObservableObject {
    static let shared = DevicesStore()

    struct Device: Identifiable, Decodable, Hashable {
        let id: UUID
        let session_key: String
        let device_label: String
        let platform: String?
        let is_desktop_app: Bool?
        let is_mobile: Bool?
        let last_seen_at: Date
        let created_at: Date
    }

    @Published private(set) var devices: [Device] = []
    @Published private(set) var loading = false
    @Published var lastError: String?

    private init() {}

    var currentSessionKey: String { SessionTracker.shared.sessionKey }

    func load(userId: UUID) async {
        loading = true
        defer { loading = false }
        do {
            let rows: [Device] = try await SupabaseManager.shared.client
                .from("user_sessions")
                .select("id,session_key,device_label,platform,is_desktop_app,is_mobile,last_seen_at,created_at")
                .eq("user_id", value: userId.uuidString)
                .is("revoked_at", value: nil)
                .order("last_seen_at", ascending: false)
                .execute()
                .value
            devices = rows
        } catch {
            lastError = "Couldn't load devices"
        }
    }

    /// Marks a session revoked. The current device can't revoke itself here —
    /// use Sign Out for that.
    func revoke(_ device: Device) async {
        guard device.session_key != currentSessionKey else { return }
        struct Patch: Encodable { let revoked_at: String }
        let now = ISO8601DateFormatter().string(from: Date())
        do {
            _ = try await SupabaseManager.shared.client
                .from("user_sessions")
                .update(Patch(revoked_at: now))
                .eq("id", value: device.id.uuidString)
                .execute()
            devices.removeAll { $0.id == device.id }
        } catch {
            lastError = "Couldn't sign out that device"
        }
    }

    var isOnlyThisDevice: Bool {
        devices.filter { $0.session_key != currentSessionKey }.isEmpty
    }
}
