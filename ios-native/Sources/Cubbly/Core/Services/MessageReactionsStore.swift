import Foundation
import Supabase
import Realtime
import SwiftUI

/// Database row mirroring `public.message_reactions`.
struct MessageReactionRow: Codable, Identifiable, Hashable {
    let id: UUID
    let messageId: UUID
    let userId: UUID
    let emoji: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, emoji
        case messageId = "message_id"
        case userId = "user_id"
        case createdAt = "created_at"
    }
}

/// Aggregated reaction shown as a pill under a chat message.
struct AggregatedReaction: Identifiable, Hashable {
    let emoji: String
    let count: Int
    let reactedByMe: Bool
    var id: String { emoji }
}

/// Quick emojis shown in the long-press slider — kept in sync with the web app.
enum QuickReactions {
    static let all: [String] = ["👍", "❤️", "😂", "😮", "😢", "🔥"]
}

/// Realtime store of reactions for a single conversation. Loads reactions for
/// a set of visible message IDs, then keeps them in sync via postgres_changes.
@MainActor
final class MessageReactionsStore: ObservableObject {
    @Published private(set) var byMessage: [UUID: [MessageReactionRow]] = [:]

    private var channel: RealtimeChannelV2?
    private var conversationId: UUID?
    private var currentUserId: UUID?

    func start(conversationId: UUID, currentUserId: UUID?) async {
        self.conversationId = conversationId
        self.currentUserId = currentUserId
        await subscribe(conversationId: conversationId)
    }

    func stop() async {
        if let ch = channel { await ch.unsubscribe() }
        channel = nil
        byMessage = [:]
    }

    /// Loads reactions for a batch of message ids — call whenever the visible
    /// timeline grows (initial load + paginating older messages).
    func load(messageIds: [UUID]) async {
        guard !messageIds.isEmpty else { return }
        do {
            let rows: [MessageReactionRow] = try await SupabaseManager.shared.client
                .from("message_reactions")
                .select()
                .in("message_id", values: messageIds)
                .execute()
                .value
            var grouped: [UUID: [MessageReactionRow]] = byMessage
            for r in rows {
                if !(grouped[r.messageId]?.contains(where: { $0.id == r.id }) ?? false) {
                    grouped[r.messageId, default: []].append(r)
                }
            }
            self.byMessage = grouped
        } catch {
            print("[Reactions] load failed:", error)
        }
    }

    func aggregated(for messageId: UUID) -> [AggregatedReaction] {
        let rows = byMessage[messageId] ?? []
        var order: [String] = []
        var counts: [String: Int] = [:]
        var mine: Set<String> = []
        for r in rows {
            if counts[r.emoji] == nil { order.append(r.emoji) }
            counts[r.emoji, default: 0] += 1
            if r.userId == currentUserId { mine.insert(r.emoji) }
        }
        return order.map { e in
            AggregatedReaction(emoji: e, count: counts[e] ?? 0,
                               reactedByMe: mine.contains(e))
        }
    }

    /// Adds the emoji if I haven't reacted with it yet, otherwise removes it.
    func toggle(messageId: UUID, emoji: String) async {
        guard let me = currentUserId else { return }
        let list = byMessage[messageId] ?? []
        if let mineRow = list.first(where: { $0.userId == me && $0.emoji == emoji }) {
            // Optimistic remove
            byMessage[messageId] = list.filter { $0.id != mineRow.id }
            do {
                try await SupabaseManager.shared.client
                    .from("message_reactions")
                    .delete()
                    .eq("id", value: mineRow.id)
                    .execute()
            } catch {
                print("[Reactions] remove failed:", error)
                // Restore on failure
                byMessage[messageId, default: []].append(mineRow)
            }
        } else {
            struct NewReaction: Encodable {
                let message_id: UUID
                let user_id: UUID
                let emoji: String
            }
            // Optimistic add
            let temp = MessageReactionRow(
                id: UUID(), messageId: messageId, userId: me,
                emoji: emoji, createdAt: Date()
            )
            byMessage[messageId, default: []].append(temp)
            do {
                let row: MessageReactionRow = try await SupabaseManager.shared.client
                    .from("message_reactions")
                    .insert(NewReaction(message_id: messageId, user_id: me, emoji: emoji))
                    .select()
                    .single()
                    .execute()
                    .value
                if let idx = byMessage[messageId]?.firstIndex(where: { $0.id == temp.id }) {
                    byMessage[messageId]?[idx] = row
                }
            } catch {
                print("[Reactions] add failed:", error)
                byMessage[messageId] = byMessage[messageId]?.filter { $0.id != temp.id } ?? []
            }
        }
    }

    private func subscribe(conversationId: UUID) async {
        let client = SupabaseManager.shared.client
        let ch = client.channel("message-reactions:\(conversationId.uuidString)")
        let inserts = ch.postgresChange(
            InsertAction.self, schema: "public", table: "message_reactions")
        let deletes = ch.postgresChange(
            DeleteAction.self, schema: "public", table: "message_reactions")

        Task { [weak self] in
            for await action in inserts {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                guard let row = try? action.decodeRecord(as: MessageReactionRow.self,
                                                         decoder: decoder) else { continue }
                await MainActor.run {
                    guard let self else { return }
                    let list = self.byMessage[row.messageId] ?? []
                    if !list.contains(where: { $0.id == row.id }) {
                        self.byMessage[row.messageId, default: []].append(row)
                    }
                }
            }
        }
        Task { [weak self] in
            for await action in deletes {
                let oldDict = action.oldRecord
                // supabase-swift v2 returns `[String: AnyJSON]` — pull the
                // underlying string via the `.stringValue` accessor.
                guard let idStr = oldDict["id"]?.stringValue,
                      let id = UUID(uuidString: idStr),
                      let msgIdStr = oldDict["message_id"]?.stringValue,
                      let msgId = UUID(uuidString: msgIdStr) else { continue }
                await MainActor.run {
                    guard let self else { return }
                    self.byMessage[msgId] = self.byMessage[msgId]?.filter { $0.id != id }
                }
            }
        }
        do { try await ch.subscribeWithError() }
        catch { print("[Reactions] subscribe failed:", error) }
        self.channel = ch
    }
}
