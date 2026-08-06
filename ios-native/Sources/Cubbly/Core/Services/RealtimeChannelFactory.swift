import Foundation
import Supabase
import Realtime

/// Creates fresh Realtime channels even with supabase-swift versions that cache
/// channels by topic. Reusing a cached subscribed/subscribing channel makes the
/// SDK reject newly attached callbacks, which leaves presence/status stuck.
@MainActor
enum RealtimeChannelFactory {
    static func make(
        _ name: String,
        client: SupabaseClient = SupabaseManager.shared.client,
        options: @Sendable (inout RealtimeChannelConfig) -> Void = { _ in }
    ) async -> RealtimeChannelV2 {
        let topic = "realtime:\(name)"
        for existing in client.channels where existing.topic == topic {
            await client.removeChannel(existing)
        }
        return client.channel(name, options: options)
    }

    static func remove(_ channel: RealtimeChannelV2?, client: SupabaseClient = SupabaseManager.shared.client) async {
        guard let channel else { return }
        await client.removeChannel(channel)
    }
}