import Foundation
import Supabase

@MainActor
struct ConversationsRepository {
    private var client: SupabaseClient { SupabaseManager.shared.client }

    func listMine() async throws -> [Conversation] {
        try await client
            .from("conversations")
            .select()
            .order("updated_at", ascending: false)
            .execute()
            .value
    }

    /// Returns rich DM-list rows (display name, last message, time, avatar).
    /// Mirrors `useConversations.ts` from the web app.
    func listSummaries(currentUserID: UUID) async throws -> [ConversationSummary] {
        // 1. Get conversations I'm in
        struct Pair: Decodable { let conversation_id: UUID }
        let myParts: [Pair] = try await client
            .from("conversation_participants")
            .select("conversation_id")
            .eq("user_id", value: currentUserID)
            .execute()
            .value

        let convIDs = myParts.map(\.conversation_id)
        guard !convIDs.isEmpty else { return [] }

        // 2. Conversation rows
        let convRows: [Conversation] = try await client
            .from("conversations")
            .select()
            .in("id", values: convIDs)
            .execute()
            .value
        let convByID = Dictionary(uniqueKeysWithValues: convRows.map { ($0.id, $0) })

        // 3. ALL participants of those conversations
        struct PartRow: Decodable { let conversation_id: UUID; let user_id: UUID }
        let allParts: [PartRow] = try await client
            .from("conversation_participants")
            .select("conversation_id,user_id")
            .in("conversation_id", values: convIDs)
            .execute()
            .value

        let otherIDs = Array(Set(allParts.map(\.user_id).filter { $0 != currentUserID }))
        let profiles: [Profile] = otherIDs.isEmpty ? [] : try await client
            .from("profiles")
            .select()
            .in("user_id", values: otherIDs)
            .execute()
            .value
        let profByUser = Dictionary(uniqueKeysWithValues: profiles.map { ($0.userID, $0) })

        // 4. Group members per conversation
        var membersByConv: [UUID: [Profile]] = [:]
        for p in allParts where p.user_id != currentUserID {
            if let prof = profByUser[p.user_id] {
                membersByConv[p.conversation_id, default: []].append(prof)
            }
        }

        // 5. Last message per conversation (single fetch, take latest per conv)
        struct LastMsg: Decodable {
            let conversation_id: UUID
            let content: String
            let created_at: Date
        }
        // Pull recent messages for these convs (limit defends against huge histories)
        let recent: [LastMsg] = try await client
            .from("messages")
            .select("conversation_id,content,created_at")
            .in("conversation_id", values: convIDs)
            .order("created_at", ascending: false)
            .limit(500)
            .execute()
            .value
        var lastByConv: [UUID: LastMsg] = [:]
        for m in recent where lastByConv[m.conversation_id] == nil {
            lastByConv[m.conversation_id] = m
        }

        // 6. Build summaries
        let summaries: [ConversationSummary] = convIDs.compactMap { id in
            guard let conv = convByID[id] else { return nil }
            let members = membersByConv[id] ?? []
            // Skip empty DMs (other user not loadable)
            if !conv.isGroup && members.isEmpty { return nil }
            let last = lastByConv[id]
            return ConversationSummary(
                id: id,
                isGroup: conv.isGroup,
                name: conv.name,
                pictureURL: conv.pictureURL,
                members: members,
                lastMessage: last?.content,
                lastMessageAt: last?.created_at,
                updatedAt: conv.updatedAt
            )
        }

        return summaries.sorted { (a, b) in
            (a.lastMessageAt ?? a.updatedAt) > (b.lastMessageAt ?? b.updatedAt)
        }
    }

    func openOrCreateDM(with otherUserID: UUID) async throws -> UUID {
        struct Args: Encodable { let other_user_id: UUID }
        let id: UUID = try await client
            .rpc("create_dm_conversation", params: Args(other_user_id: otherUserID))
            .execute()
            .value
        return id
    }

    func createGroup(name: String, memberIDs: [UUID]) async throws -> UUID {
        struct Args: Encodable { let _name: String; let _member_ids: [UUID] }
        let id: UUID = try await client
            .rpc("create_group_conversation", params: Args(_name: name, _member_ids: memberIDs))
            .execute()
            .value
        return id
    }

    func markRead(conversationID: UUID) async throws {
        struct Args: Encodable { let _conversation_id: UUID }
        try await client
            .rpc("mark_conversation_read", params: Args(_conversation_id: conversationID))
            .execute()
    }
}
