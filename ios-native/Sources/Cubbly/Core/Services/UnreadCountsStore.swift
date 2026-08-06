import Foundation
import Combine
import Supabase
import Realtime

/// Mirrors `useUnreadCounts` from the web app. Counts unread messages per
/// conversation by comparing `messages.created_at` against the user's
/// `conversation_participants.last_read_at`. Powers the red number bubbles
/// on the server-rail avatars so iOS matches the web/desktop sidebar UX.
@MainActor
final class UnreadCountsStore: ObservableObject {
    static let shared = UnreadCountsStore()

    struct Info: Hashable {
        let count: Int
        let lastSenderId: UUID?
        let lastSenderName: String?
        let lastSenderAvatar: String?
        let isGroup: Bool
        let groupName: String?
        let groupPicture: String?
    }

    @Published private(set) var byConversation: [UUID: Info] = [:]
    /// When non-nil, the conversation the user is currently viewing — its
    /// badge is hidden from the rail immediately on entry.
    var activeConversationID: UUID?

    private var userId: UUID?
    private var lastReadByConv: [UUID: Date] = [:]
    private var msgChannel: RealtimeChannelV2?
    private var partChannel: RealtimeChannelV2?

    private init() {}

    func start(userId: UUID) async {
        if self.userId == userId, msgChannel != nil { return }
        await stop()
        self.userId = userId
        await refresh()
        await subscribe()
    }

    func stop() async {
        await RealtimeChannelFactory.remove(msgChannel)
        await RealtimeChannelFactory.remove(partChannel)
        msgChannel = nil
        partChannel = nil
        userId = nil
        byConversation = [:]
        lastReadByConv = [:]
    }

    var totalUnread: Int { byConversation.values.reduce(0) { $0 + $1.count } }

    func clearLocal(conversationID: UUID) {
        byConversation.removeValue(forKey: conversationID)
        lastReadByConv[conversationID] = Date()
    }

    func refresh() async {
        guard let uid = userId else { return }
        let client = SupabaseManager.shared.client
        struct Part: Decodable { let conversation_id: UUID; let last_read_at: Date }
        struct Conv: Decodable {
            let id: UUID
            let is_group: Bool
            let name: String?
            let picture_url: String?
        }
        struct Msg: Decodable {
            let conversation_id: UUID
            let sender_id: UUID
            let created_at: Date
        }
        do {
            let parts: [Part] = try await client
                .from("conversation_participants")
                .select("conversation_id,last_read_at")
                .eq("user_id", value: uid.uuidString)
                .execute()
                .value
            guard !parts.isEmpty else {
                byConversation = [:]
                lastReadByConv = [:]
                return
            }
            lastReadByConv = Dictionary(uniqueKeysWithValues: parts.map { ($0.conversation_id, $0.last_read_at) })
            let convIds = parts.map { $0.conversation_id.uuidString }
            let convs: [Conv] = try await client
                .from("conversations")
                .select("id,is_group,name,picture_url")
                .in("id", values: convIds)
                .execute()
                .value
            let convMap = Dictionary(uniqueKeysWithValues: convs.map { ($0.id, $0) })

            // Pull a recent window of messages and count per conversation in
            // memory — one DB roundtrip instead of N.
            let recent: [Msg] = try await client
                .from("messages")
                .select("conversation_id,sender_id,created_at")
                .in("conversation_id", values: convIds)
                .neq("sender_id", value: uid.uuidString)
                .order("created_at", ascending: false)
                .limit(500)
                .execute()
                .value

            // Need sender profile + last message per conv.
            var counts: [UUID: Int] = [:]
            var latestByConv: [UUID: Msg] = [:]
            for m in recent {
                let lr = lastReadByConv[m.conversation_id] ?? .distantPast
                if m.created_at > lr {
                    counts[m.conversation_id, default: 0] += 1
                    if latestByConv[m.conversation_id] == nil
                        || latestByConv[m.conversation_id]!.created_at < m.created_at {
                        latestByConv[m.conversation_id] = m
                    }
                }
            }
            let senderIds = Array(Set(latestByConv.values.map { $0.sender_id.uuidString }))
            struct ProfRow: Decodable {
                let user_id: UUID
                let display_name: String?
                let avatar_url: String?
            }
            var profMap: [UUID: ProfRow] = [:]
            if !senderIds.isEmpty {
                let profs: [ProfRow] = (try? await client
                    .from("profiles")
                    .select("user_id,display_name,avatar_url")
                    .in("user_id", values: senderIds)
                    .execute()
                    .value) ?? []
                profMap = Dictionary(uniqueKeysWithValues: profs.map { ($0.user_id, $0) })
            }

            var out: [UUID: Info] = [:]
            for (convId, count) in counts {
                let conv = convMap[convId]
                let last = latestByConv[convId]
                let prof = last.flatMap { profMap[$0.sender_id] }
                out[convId] = Info(
                    count: count,
                    lastSenderId: last?.sender_id,
                    lastSenderName: prof?.display_name,
                    lastSenderAvatar: prof?.avatar_url,
                    isGroup: conv?.is_group ?? false,
                    groupName: conv?.name,
                    groupPicture: conv?.picture_url
                )
            }
            byConversation = out
        } catch {
            // Quiet — realtime + next refresh tick will heal.
        }
    }

    private func subscribe() async {
        guard let uid = userId else { return }
        let mc = await RealtimeChannelFactory.make("unread-msgs:\(uid.uuidString.lowercased())")
        let inserts = mc.postgresChange(
            InsertAction.self, schema: "public", table: "messages")
        Task { [weak self] in
            for await action in inserts {
                guard let self else { return }
                let dict = action.record
                guard
                    let convStr = dict["conversation_id"]?.stringValue,
                    let convId = UUID(uuidString: convStr),
                    let senderStr = dict["sender_id"]?.stringValue,
                    let senderId = UUID(uuidString: senderStr)
                else { continue }
                if senderId == uid { continue }
                if self.lastReadByConv[convId] == nil {
                    // Not in our cache — full refresh.
                    await self.refresh()
                    continue
                }
                if self.activeConversationID == convId { continue }
                // Optimistic increment + best-effort profile fetch.
                let existing = self.byConversation[convId]
                let nextCount = (existing?.count ?? 0) + 1
                self.byConversation[convId] = Info(
                    count: nextCount,
                    lastSenderId: senderId,
                    lastSenderName: existing?.lastSenderName,
                    lastSenderAvatar: existing?.lastSenderAvatar,
                    isGroup: existing?.isGroup ?? false,
                    groupName: existing?.groupName,
                    groupPicture: existing?.groupPicture
                )
                Task { await self.hydrateSender(convId: convId, senderId: senderId) }
            }
        }
        do { try await mc.subscribeWithError() }
        catch { print("[Unread] messages channel subscribe failed:", error) }
        msgChannel = mc

        let pc = await RealtimeChannelFactory.make("unread-parts:\(uid.uuidString.lowercased())")
        let partUpdates = pc.postgresChange(
            UpdateAction.self, schema: "public", table: "conversation_participants",
            filter: "user_id=eq.\(uid.uuidString)")
        Task { [weak self] in
            for await _ in partUpdates { await self?.refresh() }
        }
        do { try await pc.subscribeWithError() }
        catch { print("[Unread] participants channel subscribe failed:", error) }
        partChannel = pc
    }

    private func hydrateSender(convId: UUID, senderId: UUID) async {
        struct ProfRow: Decodable {
            let display_name: String?
            let avatar_url: String?
        }
        struct ConvRow: Decodable {
            let is_group: Bool
            let name: String?
            let picture_url: String?
        }
        do {
            let prof: ProfRow = try await SupabaseManager.shared.client
                .from("profiles").select("display_name,avatar_url")
                .eq("user_id", value: senderId.uuidString)
                .single().execute().value
            let conv: ConvRow = try await SupabaseManager.shared.client
                .from("conversations").select("is_group,name,picture_url")
                .eq("id", value: convId.uuidString)
                .single().execute().value
            if let existing = byConversation[convId] {
                byConversation[convId] = Info(
                    count: existing.count,
                    lastSenderId: existing.lastSenderId,
                    lastSenderName: prof.display_name,
                    lastSenderAvatar: prof.avatar_url,
                    isGroup: conv.is_group,
                    groupName: conv.name,
                    groupPicture: conv.picture_url
                )
            }
        } catch {}
    }
}

private extension AnyJSON {
    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
}
