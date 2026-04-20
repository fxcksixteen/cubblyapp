import SwiftUI
import Supabase
import Realtime

/// Discord-style 1:1 / group chat thread. Realtime, optimistic, with reply,
/// typing indicator, and GIPHY picker. Mirrors `src/components/app/ChatView.tsx`.
struct ChatView: View {
    let conversation: ConversationSummary

    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService
    @Environment(\.dismiss) private var dismiss

    @State private var messages: [ChatMessage] = []
    @State private var loading = true
    @State private var hasMore = false
    @State private var loadingOlder = false
    @State private var draft = ""
    @State private var replyingTo: ChatMessage?
    @State private var showGifPicker = false
    @State private var typingUserNames: [String] = []
    @State private var channel: RealtimeChannelV2?
    @State private var typingChannel: RealtimeChannelV2?
    @State private var lastTypingBroadcast: Date = .distantPast
    @State private var scrollAnchor: String?

    private let repo = MessagesRepository()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().background(Theme.Colors.divider)

            if loading && messages.isEmpty {
                ProgressView().tint(Theme.Colors.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                messageList
            }

            typingBar
            replyBar
            composer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
        .navigationBarBackButtonHidden(true)
        .horizontalSwipe(right: { dismiss() })
        .sheet(isPresented: $showGifPicker) {
            GiphyPickerView { url in
                showGifPicker = false
                Task { await sendRaw(content: url) }
            }
            .presentationDetents([.medium, .large])
        }
        .task {
            await loadInitial()
            await subscribe()
            await markRead()
        }
        .onDisappear {
            Task {
                if let ch = channel { await ch.unsubscribe() }
                if let tc = typingChannel { await tc.unsubscribe() }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 10) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .frame(width: 36, height: 36)
            }

            ZStack(alignment: .bottomTrailing) {
                AvatarView(url: conversation.avatarURL,
                           fallbackText: conversation.displayName, size: 32)
                if let other = conversation.otherUser {
                    let live = presence.effectiveStatus(for: other.userID, storedStatus: other.status)
                    StatusDot(rawStatus: live, isOnline: presence.isOnline(other.userID),
                              size: 10, borderColor: Theme.Colors.bgPrimary)
                        .offset(x: 2, y: 2)
                }
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(conversation.displayName)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                if let other = conversation.otherUser {
                    let live = presence.effectiveStatus(for: other.userID, storedStatus: other.status)
                    Text(live.capitalized)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
            Spacer()

            Button {} label: {
                SVGIcon(name: "call", size: 18, tint: Theme.Colors.textSecondary)
            }
            Button {} label: {
                SVGIcon(name: "video-camera", size: 18, tint: Theme.Colors.textSecondary)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Theme.Colors.bgPrimary)
    }

    // MARK: - Messages list

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 2) {
                    if hasMore {
                        Button { Task { await loadOlder() } } label: {
                            if loadingOlder {
                                ProgressView().tint(Theme.Colors.textSecondary)
                            } else {
                                Text("Load older messages")
                                    .font(Theme.Fonts.bodySmall)
                                    .foregroundStyle(Theme.Colors.textSecondary)
                            }
                        }
                        .padding(.vertical, 10)
                    }

                    ForEach(Array(messages.enumerated()), id: \.element.id) { idx, m in
                        let prev = idx > 0 ? messages[idx - 1] : nil
                        let grouped = prev?.senderID == m.senderID &&
                            (m.createdAt.timeIntervalSince(prev?.createdAt ?? .distantPast) < 7 * 60)
                        MessageBubble(message: m,
                                      grouped: grouped,
                                      isMine: m.senderID == session.currentUserID,
                                      onReply: { replyingTo = m })
                            .id(m.id)
                            .padding(.horizontal, 12)
                    }
                }
                .padding(.top, 8)
            }
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last?.id {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last, anchor: .bottom)
                    }
                }
            }
            .onAppear {
                if let last = messages.last?.id { proxy.scrollTo(last, anchor: .bottom) }
            }
        }
    }

    // MARK: - Typing bar

    @ViewBuilder
    private var typingBar: some View {
        if !typingUserNames.isEmpty {
            HStack(spacing: 6) {
                ProgressView().scaleEffect(0.6).tint(Theme.Colors.textSecondary)
                Text(typingText)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.Colors.textSecondary)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 2)
        }
    }

    private var typingText: String {
        if typingUserNames.count == 1 { return "\(typingUserNames[0]) is typing…" }
        if typingUserNames.count == 2 { return "\(typingUserNames[0]) and \(typingUserNames[1]) are typing…" }
        return "Several people are typing…"
    }

    // MARK: - Reply bar

    @ViewBuilder
    private var replyBar: some View {
        if let r = replyingTo {
            HStack(spacing: 8) {
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Colors.textSecondary)
                Text("Replying to ")
                    .foregroundStyle(Theme.Colors.textSecondary) +
                Text(r.senderName ?? "Unknown")
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(r.content.prefix(60))
                    .foregroundStyle(Theme.Colors.textMuted)
                    .lineLimit(1)
                Spacer()
                Button { replyingTo = nil } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
            .font(.system(size: 12))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Theme.Colors.bgSecondary)
        }
    }

    // MARK: - Composer

    private var composer: some View {
        HStack(spacing: 8) {
            Button { showGifPicker = true } label: {
                SVGIcon(name: "gif", size: 22, tint: Theme.Colors.textSecondary)
            }

            TextField("Message \(conversation.displayName)", text: $draft, axis: .vertical)
                .font(Theme.Fonts.body)
                .foregroundStyle(Theme.Colors.textPrimary)
                .textInputAutocapitalization(.sentences)
                .lineLimit(1...5)
                .padding(.vertical, 10)
                .padding(.horizontal, 12)
                .background(Theme.Colors.bgTertiary)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .onChange(of: draft) { _, _ in broadcastTyping() }
                .onSubmit { Task { await send() } }

            Button { Task { await send() } } label: {
                SVGIcon(name: "send", size: 20,
                        tint: draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                              ? Theme.Colors.textMuted : Theme.Colors.primary)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Theme.Colors.bgPrimary)
        .overlay(Rectangle().fill(Theme.Colors.divider).frame(height: 1), alignment: .top)
    }

    // MARK: - Loading / sending

    private func loadInitial() async {
        loading = true
        defer { loading = false }
        do {
            let rows = try await repo.fetchPage(conversationID: conversation.id, limit: 50)
            let asc = rows.reversed()
            messages = try await hydrate(Array(asc))
            hasMore = rows.count >= 50
        } catch {
            print("[Chat] load failed:", error)
        }
    }

    private func loadOlder() async {
        guard hasMore, !loadingOlder, let oldest = messages.first?.createdAt else { return }
        loadingOlder = true
        defer { loadingOlder = false }
        do {
            let rows = try await repo.fetchPage(conversationID: conversation.id, before: oldest, limit: 50)
            let asc = rows.reversed()
            let hydrated = try await hydrate(Array(asc))
            messages.insert(contentsOf: hydrated, at: 0)
            hasMore = rows.count >= 50
        } catch { print("[Chat] loadOlder failed:", error) }
    }

    private func hydrate(_ rows: [ChatMessageRow]) async throws -> [ChatMessage] {
        let senderIDs = Array(Set(rows.map(\.senderID)))
        let replyIDs = Array(Set(rows.compactMap(\.replyToID)))
        async let profilesTask = repo.loadSenderProfiles(senderIDs)
        async let repliesTask = repo.loadReplyPreviews(replyIDs)
        let (profiles, replies) = try await (profilesTask, repliesTask)

        return rows.map { r in
            var rp: ChatMessage.ReplyPreview?
            if let rid = r.replyToID, let row = replies[rid] {
                rp = ChatMessage.ReplyPreview(
                    id: row.id, senderID: row.senderID,
                    senderName: profiles[row.senderID]?.displayName ?? "Unknown",
                    content: row.content)
            }
            return ChatMessage(
                id: r.id.uuidString,
                conversationID: r.conversationID,
                senderID: r.senderID,
                content: r.content,
                createdAt: r.createdAt,
                replyToID: r.replyToID,
                replyTo: rp,
                senderName: profiles[r.senderID]?.displayName,
                senderAvatarURL: profiles[r.senderID]?.avatarURL,
                status: .delivered
            )
        }
    }

    private func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        draft = ""
        await sendRaw(content: trimmed)
    }

    private func sendRaw(content: String) async {
        guard let me = session.currentUserID else { return }
        let tempID = "temp-\(UUID().uuidString)"
        let myProfile = session.currentProfile
        let optimistic = ChatMessage(
            id: tempID,
            conversationID: conversation.id,
            senderID: me,
            content: content,
            createdAt: Date(),
            replyToID: replyingTo?.replyToID == nil ? UUID(uuidString: replyingTo?.id ?? "") : nil,
            replyTo: replyingTo.map {
                .init(id: UUID(uuidString: $0.id) ?? UUID(),
                      senderID: $0.senderID,
                      senderName: $0.senderName ?? "Unknown",
                      content: $0.content)
            },
            senderName: myProfile?.displayName,
            senderAvatarURL: myProfile?.avatarURL,
            status: .sending
        )
        messages.append(optimistic)
        let replyID = optimistic.replyToID
        replyingTo = nil

        do {
            let row = try await repo.send(conversationID: conversation.id,
                                          senderID: me, content: content, replyTo: replyID)
            if let idx = messages.firstIndex(where: { $0.id == tempID }) {
                messages[idx] = ChatMessage(
                    id: row.id.uuidString,
                    conversationID: row.conversationID,
                    senderID: row.senderID,
                    content: row.content,
                    createdAt: row.createdAt,
                    replyToID: row.replyToID,
                    replyTo: optimistic.replyTo,
                    senderName: optimistic.senderName,
                    senderAvatarURL: optimistic.senderAvatarURL,
                    status: .sent
                )
            }
        } catch {
            print("[Chat] send failed:", error)
            if let idx = messages.firstIndex(where: { $0.id == tempID }) {
                messages[idx].status = .failed
            }
        }
    }

    private func markRead() async {
        try? await ConversationsRepository().markRead(conversationID: conversation.id)
    }

    // MARK: - Realtime (messages + typing)

    private func subscribe() async {
        let client = SupabaseManager.shared.client

        // Messages INSERT/DELETE
        let ch = client.channel("messages:\(conversation.id.uuidString)")
        let inserts = ch.postgresChange(
            InsertAction.self, schema: "public", table: "messages",
            filter: "conversation_id=eq.\(conversation.id.uuidString)")
        let deletes = ch.postgresChange(
            DeleteAction.self, schema: "public", table: "messages",
            filter: "conversation_id=eq.\(conversation.id.uuidString)")

        Task {
            for await action in inserts {
                guard let row = try? action.decodeRecord(as: ChatMessageRow.self,
                                                         decoder: jsonDecoder()) else { continue }
                await handleIncoming(row)
            }
        }
        Task {
            for await action in deletes {
                if let id = (action.oldRecord["id"] as? String).flatMap(UUID.init(uuidString:)) {
                    await MainActor.run { messages.removeAll { $0.id == id.uuidString } }
                }
            }
        }
        await ch.subscribe()
        channel = ch

        // Typing broadcast
        let tc = client.channel("typing:\(conversation.id.uuidString)")
        let typing = tc.broadcastStream(event: "typing")
        Task {
            for await msg in typing {
                guard let userID = (msg["user_id"] as? String).flatMap(UUID.init(uuidString:)),
                      userID != session.currentUserID,
                      let name = msg["name"] as? String else { continue }
                await MainActor.run {
                    if !typingUserNames.contains(name) { typingUserNames.append(name) }
                }
                Task {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    await MainActor.run { typingUserNames.removeAll { $0 == name } }
                }
            }
        }
        await tc.subscribe()
        typingChannel = tc
    }

    private func handleIncoming(_ row: ChatMessageRow) async {
        // Replace optimistic if a duplicate matches; else append.
        if let idx = messages.firstIndex(where: {
            $0.isOptimistic && $0.content == row.content && $0.senderID == row.senderID
        }) {
            let existing = messages[idx]
            let prof = try? await repo.loadSenderProfiles([row.senderID])
            messages[idx] = ChatMessage(
                id: row.id.uuidString,
                conversationID: row.conversationID,
                senderID: row.senderID,
                content: row.content,
                createdAt: row.createdAt,
                replyToID: row.replyToID,
                replyTo: existing.replyTo,
                senderName: prof?[row.senderID]?.displayName ?? existing.senderName,
                senderAvatarURL: prof?[row.senderID]?.avatarURL ?? existing.senderAvatarURL,
                status: .delivered
            )
            return
        }
        if messages.contains(where: { $0.id == row.id.uuidString }) { return }
        do {
            let hydrated = try await hydrate([row])
            messages.append(contentsOf: hydrated)
        } catch { print("[Chat] hydrate incoming failed:", error) }
    }

    private func broadcastTyping() {
        let now = Date()
        guard now.timeIntervalSince(lastTypingBroadcast) > 1.5 else { return }
        lastTypingBroadcast = now
        guard let me = session.currentUserID, let tc = typingChannel else { return }
        let name = session.currentProfile?.displayName ?? "Someone"
        Task {
            try? await tc.broadcast(event: "typing", message: [
                "user_id": me.uuidString,
                "name": name
            ])
        }
    }

    private func jsonDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }
}

// MARK: - Bubble

private struct MessageBubble: View {
    let message: ChatMessage
    let grouped: Bool
    let isMine: Bool
    let onReply: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if !isMine {
                if grouped {
                    Color.clear.frame(width: 36, height: 1)
                } else {
                    AvatarView(url: message.senderAvatarURL.flatMap(URL.init(string:)),
                               fallbackText: message.senderName ?? "?",
                               size: 36)
                        .padding(.top, 2)
                }
            } else {
                Spacer(minLength: 40)
            }

            VStack(alignment: isMine ? .trailing : .leading, spacing: 2) {
                if !grouped {
                    HStack(spacing: 6) {
                        if !isMine {
                            Text(message.senderName ?? "Unknown")
                                .font(Theme.Fonts.bodyMedium)
                                .foregroundStyle(Theme.Colors.textPrimary)
                        }
                        Text(timeString(message.createdAt))
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                }
                if let r = message.replyTo {
                    HStack(spacing: 4) {
                        Image(systemName: "arrowshape.turn.up.left.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(Theme.Colors.textMuted)
                        Text("\(r.senderName) ").bold()
                        + Text(r.content).foregroundStyle(Theme.Colors.textSecondary)
                    }
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .lineLimit(1)
                }

                if isGifURL(message.content), let url = URL(string: message.content) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        Rectangle().fill(Theme.Colors.bgSecondary).frame(height: 120)
                    }
                    .frame(maxWidth: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    Text(message.content)
                        .font(Theme.Fonts.body)
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(isMine ? Theme.Colors.primary.opacity(0.85) : Theme.Colors.bgSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                if message.status == .sending {
                    Text("Sending…").font(.system(size: 9)).foregroundStyle(Theme.Colors.textMuted)
                } else if message.status == .failed {
                    Text("Failed to send").font(.system(size: 9)).foregroundStyle(Theme.Colors.danger)
                }
            }

            if isMine {
                if grouped {
                    Color.clear.frame(width: 36, height: 1)
                } else {
                    AvatarView(url: message.senderAvatarURL.flatMap(URL.init(string:)),
                               fallbackText: message.senderName ?? "?",
                               size: 36)
                        .padding(.top, 2)
                }
            } else {
                Spacer(minLength: 40)
            }
        }
        .padding(.top, grouped ? 1 : 6)
        .contextMenu {
            Button { onReply() } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
            Button {
                UIPasteboard.general.string = message.content
            } label: { Label("Copy", systemImage: "doc.on.doc") }
        }
    }

    private func timeString(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }

    private func isGifURL(_ s: String) -> Bool {
        let lower = s.lowercased()
        return (lower.hasPrefix("http") && (lower.contains(".gif") || lower.contains("giphy.com")))
    }
}
