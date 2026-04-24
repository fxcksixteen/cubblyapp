import SwiftUI
import PhotosUI
import Photos
import Supabase
import Realtime

/// Discord-iOS-style 1:1 / group chat. All messages left-aligned with avatar
/// + display name (just like Discord's mobile app), automatic infinite scroll
/// upward, long-press half-sheet for actions, in-app video player, link
/// previews, and tap-to-dismiss-keyboard.
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
    @State private var showAttachments = false
    @State private var typingUserNames: [String] = []
    @State private var channel: RealtimeChannelV2?
    @State private var typingChannel: RealtimeChannelV2?
    @State private var lastTypingBroadcast: Date = .distantPast
    @State private var actionSheetMessage: ChatMessage?
    @State private var videoURL: IdentifiedURL?
    @State private var lightboxURL: IdentifiedURL?
    @FocusState private var composerFocused: Bool

    private let repo = MessagesRepository()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().background(Theme.Colors.divider)

            ZStack {
                if loading && messages.isEmpty {
                    ProgressView().tint(Theme.Colors.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    messageList
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            typingBar
            replyBar
            composer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
        .navigationBarHidden(true)
        .horizontalSwipe(
            right: { dismiss() },
            leftPreview: { Color.clear },
            rightPreview: { DMSidebarPreview() }
        )
        .sheet(isPresented: $showGifPicker) {
            GiphyPickerView { url in
                showGifPicker = false
                Task { await sendRaw(content: url) }
            }
            .environmentObject(session)
            .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showAttachments) {
            AttachmentsPicker { urls in
                Task { await sendAttachments(urls: urls) }
            }
            .presentationDetents([.fraction(0.55), .large])
        }
        .sheet(item: $actionSheetMessage) { msg in
            MessageActionSheet(message: msg,
                               onReply: { replyingTo = msg; actionSheetMessage = nil },
                               onCopy:  { UIPasteboard.general.string = msg.content; actionSheetMessage = nil },
                               onDelete: msg.senderID == session.currentUserID
                                   ? { Task { await deleteMessage(msg) }; actionSheetMessage = nil }
                                   : nil)
                .presentationDetents([.fraction(0.32)])
                .presentationDragIndicator(.visible)
        }
        .fullScreenCover(item: $videoURL) { item in
            InAppVideoPlayer(url: item.url)
        }
        .fullScreenCover(item: $lightboxURL) { item in
            ImageLightbox(url: item.url) { lightboxURL = nil }
        }
        .task {
            await loadInitial()
            await subscribe()
            await markRead()
            // Tell the notification service this conversation is now active so
            // we don't show a banner for messages that arrive while the user
            // is reading them.
            NotificationService.shared.activeConversationID = conversation.id
        }
        .onDisappear {
            if NotificationService.shared.activeConversationID == conversation.id {
                NotificationService.shared.activeConversationID = nil
            }
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
                if conversation.isGroup && conversation.pictureURL == nil {
                    GroupAvatar(members: conversation.members, size: 32)
                } else {
                    AvatarView(url: conversation.avatarURL,
                               fallbackText: conversation.displayName, size: 32)
                }
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
                        .font(.cubbly(11))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
            Spacer()

            // Voice + Video buttons — properly spaced apart and away from the
            // device edge (matches Discord iOS).
            HStack(spacing: 18) {
                Button {
                    startVoiceCall()
                } label: {
                    SVGIcon(name: "call", size: 20, tint: Theme.Colors.textSecondary)
                        .frame(width: 36, height: 36)
                }
                .disabled(conversation.isGroup) // v0.1.0: 1:1 only
                Button {} label: {
                    SVGIcon(name: "video-camera", size: 20, tint: Theme.Colors.textSecondary.opacity(0.4))
                        .frame(width: 36, height: 36)
                }
                .disabled(true) // v0.1.0: outgoing video not supported
            }
            .padding(.trailing, 12)
        }
        .padding(.leading, 8)
        .padding(.vertical, 6)
        .background(Theme.Colors.bgPrimary)
    }

    // MARK: - Messages list

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 2) {
                    if loadingOlder {
                        ProgressView().tint(Theme.Colors.textSecondary)
                            .padding(.vertical, 10)
                    }
                    // Sentinel at the very top — when it appears, fetch older.
                    Color.clear.frame(height: 1)
                        .onAppear {
                            if hasMore && !loadingOlder { Task { await loadOlder() } }
                        }
                        .id("top-sentinel")

                    ForEach(Array(messages.enumerated()), id: \.element.id) { idx, m in
                        let prev = idx > 0 ? messages[idx - 1] : nil
                        let grouped = prev?.senderID == m.senderID &&
                            (m.createdAt.timeIntervalSince(prev?.createdAt ?? .distantPast) < 7 * 60)
                        DiscordStyleBubble(
                            message: m,
                            grouped: grouped,
                            currentUserID: session.currentUserID,
                            onLongPress: { actionSheetMessage = m },
                            onPlayVideo: { url in videoURL = IdentifiedURL(url: url) },
                            onTapImage: { url in lightboxURL = IdentifiedURL(url: url) }
                        )
                        .id(m.id)
                        .padding(.horizontal, 10)
                    }
                }
                .padding(.top, 8)
                .padding(.bottom, 6)
            }
            .scrollDismissesKeyboard(.interactively)
            .simultaneousGesture(TapGesture().onEnded { composerFocused = false })
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last?.id {
                    withAnimation(.easeOut(duration: 0.18)) {
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
                    .font(.cubbly(12))
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
            .font(.cubbly(12))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Theme.Colors.bgSecondary)
        }
    }

    // MARK: - Composer

    private var composer: some View {
        let hasDraft = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return HStack(spacing: 10) {
            Button {
                showAttachments.toggle()
                composerFocused = false
            } label: {
                ZStack {
                    Circle().fill(Theme.Colors.bgTertiary).frame(width: 36, height: 36)
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
            .buttonStyle(.plain)

            HStack(alignment: .bottom, spacing: 6) {
                TextField("Message \(conversation.displayName)", text: $draft, axis: .vertical)
                    .font(Theme.Fonts.body)
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .textInputAutocapitalization(.sentences)
                    .lineLimit(1...5)
                    .focused($composerFocused)
                    .onChange(of: draft) { _, _ in broadcastTyping() }

                Button { showGifPicker = true } label: {
                    SVGIcon(name: "gif", size: 22, tint: Theme.Colors.textSecondary)
                        .padding(.bottom, 2)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(Theme.Colors.bgTertiary)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            Button { Task { await send() } } label: {
                ZStack {
                    Circle()
                        .fill(hasDraft ? Theme.Colors.primary : Theme.Colors.bgTertiary)
                        .frame(width: 36, height: 36)
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(hasDraft ? .white : Theme.Colors.textMuted)
                }
            }
            .buttonStyle(.plain)
            .disabled(!hasDraft)
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
        } catch is CancellationError {} catch {
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
        } catch is CancellationError {} catch {
            print("[Chat] loadOlder failed:", error)
        }
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
            replyToID: replyingTo.flatMap { UUID(uuidString: $0.id) },
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

    private func deleteMessage(_ msg: ChatMessage) async {
        guard let id = UUID(uuidString: msg.id) else { return }
        do {
            try await repo.delete(messageID: id)
            messages.removeAll { $0.id == msg.id }
        } catch { print("[Chat] delete failed:", error) }
    }

    private func markRead() async {
        try? await ConversationsRepository().markRead(conversationID: conversation.id)
    }

    /// Uploads picked photo/video URLs to the chat-attachments bucket and
    /// sends a single message using the PWA's `[attachments]\n[...]` format.
    /// Sending in this shape means web and iOS clients both render the files
    /// inline — previously we pushed bare URLs, which other platforms didn't
    /// recognize as attachments.
    private func sendAttachments(urls: [URL]) async {
        guard !urls.isEmpty, let me = session.currentUserID else { return }
        let client = SupabaseManager.shared.client
        var attachments: [MessageAttachment] = []

        for u in urls {
            do {
                let data = try Data(contentsOf: u)
                let ext = u.pathExtension.isEmpty ? "bin" : u.pathExtension.lowercased()
                let name = u.lastPathComponent
                let path = "\(me.uuidString)/\(UUID().uuidString).\(ext)"
                _ = try await client.storage
                    .from("chat-attachments")
                    .upload(path, data: data, options: FileOptions(upsert: false))
                // Signed URL valid for 7 days — RLS keeps the bucket private.
                let signed = try await client.storage
                    .from("chat-attachments")
                    .createSignedURL(path: path, expiresIn: 60 * 60 * 24 * 7)
                attachments.append(MessageAttachment(
                    name: name,
                    url: signed,
                    mimeType: Self.mimeType(forExtension: ext),
                    size: data.count,
                    width: nil,
                    height: nil
                ))
            } catch {
                print("[Chat] attachment upload failed:", error)
            }
        }

        guard !attachments.isEmpty else { return }
        let payload = MessageAttachmentsParser.serialize(attachments)
        await sendRaw(content: payload)
    }

    private static func mimeType(forExtension ext: String) -> String? {
        switch ext.lowercased() {
        case "png":          return "image/png"
        case "jpg", "jpeg":  return "image/jpeg"
        case "gif":          return "image/gif"
        case "webp":         return "image/webp"
        case "heic":         return "image/heic"
        case "heif":         return "image/heif"
        case "mp4":          return "video/mp4"
        case "mov":          return "video/quicktime"
        case "m4v":          return "video/x-m4v"
        case "webm":         return "video/webm"
        default:             return nil
        }
    }

    // MARK: - Realtime (messages + typing)

    private func subscribe() async {
        let client = SupabaseManager.shared.client

        let ch = client.channel("messages:\(conversation.id.uuidString)")
        let inserts = ch.postgresChange(
            InsertAction.self, schema: "public", table: "messages",
            filter: "conversation_id=eq.\(conversation.id.uuidString)")
        let updates = ch.postgresChange(
            UpdateAction.self, schema: "public", table: "messages",
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
            for await action in updates {
                guard let row = try? action.decodeRecord(as: ChatMessageRow.self,
                                                         decoder: jsonDecoder()) else { continue }
                await MainActor.run {
                    if let idx = messages.firstIndex(where: { $0.id == row.id.uuidString }) {
                        messages[idx].content = row.content
                    }
                }
            }
        }
        Task {
            for await action in deletes {
                if let id = (action.oldRecord["id"] as? String).flatMap(UUID.init(uuidString:)) {
                    await MainActor.run { messages.removeAll { $0.id == id.uuidString } }
                }
            }
        }
        do { try await ch.subscribeWithError() }
        catch { print("[Chat] messages channel subscribe failed:", error) }
        channel = ch

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
        do { try await tc.subscribeWithError() }
        catch { print("[Chat] typing channel subscribe failed:", error) }
        typingChannel = tc
    }

    private func handleIncoming(_ row: ChatMessageRow) async {
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

// MARK: - Helpers

struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

// MARK: - Discord-style bubble

/// Discord iOS layout: every row is a left-aligned avatar + display name +
/// content stack. Mine and theirs look identical (no right-alignment, no
/// blue tint). Long-press triggers the half-sheet with options.
private struct DiscordStyleBubble: View {
    let message: ChatMessage
    let grouped: Bool
    let currentUserID: UUID?
    let onLongPress: () -> Void
    let onPlayVideo: (URL) -> Void
    let onTapImage: (URL) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Avatar (or spacer for grouped continuations)
            if grouped {
                Color.clear.frame(width: 40, height: 1)
            } else {
                AvatarView(url: message.senderAvatarURL.flatMap(URL.init(string:)),
                           fallbackText: message.senderName ?? "?",
                           size: 40)
                    .padding(.top, 2)
            }

            VStack(alignment: .leading, spacing: 3) {
                if !grouped {
                    HStack(spacing: 6) {
                        Text(message.senderName ?? "Unknown")
                            .font(Theme.Fonts.bodyMedium)
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Text(timeString(message.createdAt))
                            .font(.cubbly(10))
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                }

                if let r = message.replyTo {
                    HStack(spacing: 4) {
                        Image(systemName: "arrowshape.turn.up.left.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(Theme.Colors.textMuted)
                        (Text("\(r.senderName) ").bold().foregroundColor(Theme.Colors.textPrimary)
                         + Text(r.content).foregroundColor(Theme.Colors.textSecondary))
                            .font(.cubbly(12))
                            .lineLimit(1)
                    }
                }

                content

                if message.status == .sending {
                    Text("Sending…")
                        .font(.cubbly(9))
                        .foregroundStyle(Theme.Colors.textMuted)
                } else if message.status == .failed {
                    Text("Failed to send")
                        .font(.cubbly(9))
                        .foregroundStyle(Theme.Colors.danger)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.top, grouped ? 1 : 6)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 0.32) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            onLongPress()
        }
    }

    @ViewBuilder
    private var content: some View {
        // Messages sent from the PWA use `[attachments]\n[{...}]` to encode
        // one or more files in the content column. Parse + render those
        // inline before falling back to plain-text / single-URL handling.
        if let parsed = MessageAttachmentsParser.parse(message.content) {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(parsed.attachments.enumerated()), id: \.offset) { _, att in
                    attachmentView(att)
                }
                if !parsed.text.isEmpty {
                    LinkifiedText(content: parsed.text)
                }
            }
        } else {
            plainContent
        }
    }

    @ViewBuilder
    private func attachmentView(_ att: MessageAttachment) -> some View {
        if let url = att.url {
            if att.isGIF {
                AnimatedImageView(url: url, contentMode: .scaleAspectFit)
                    .frame(maxWidth: 240)
                    .frame(height: 180)
                    .background(Theme.Colors.bgSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if att.isImage {
                Button { onTapImage(url) } label: {
                    AsyncImage(url: url) { img in
                        img.resizable().scaledToFit()
                    } placeholder: {
                        Rectangle().fill(Theme.Colors.bgSecondary)
                            .frame(width: 220, height: 160)
                    }
                    .frame(maxWidth: 260, maxHeight: 320)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            } else if att.isVideo {
                Button { onPlayVideo(url) } label: {
                    ZStack {
                        Rectangle().fill(Theme.Colors.bgSecondary)
                            .frame(width: 220, height: 160)
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.white.opacity(0.95))
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
            } else {
                // Non-media attachment — render as a tappable file chip.
                Link(destination: url) {
                    HStack(spacing: 10) {
                        Image(systemName: "doc.fill")
                            .foregroundStyle(Theme.Colors.textSecondary)
                        Text(att.name ?? url.lastPathComponent)
                            .font(Theme.Fonts.bodyMedium)
                            .foregroundStyle(Theme.Colors.textPrimary)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Theme.Colors.bgSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        } else {
            Text(att.name ?? "Attachment")
                .font(.cubbly(12))
                .foregroundStyle(Theme.Colors.textMuted)
        }
    }

    @ViewBuilder
    private var plainContent: some View {
        let url = URL(string: message.content)
        let lower = message.content.lowercased()
        let isHTTP = lower.hasPrefix("http")
        let isGIF = isHTTP && (lower.contains(".gif") || lower.contains("giphy.com")
                               || lower.contains("media.giphy") || lower.contains("tenor.com"))
        let isImage = isHTTP && (lower.contains(".png") || lower.contains(".jpg")
                               || lower.contains(".jpeg") || lower.contains(".webp"))
        let isVideo = isHTTP && (lower.contains(".mp4") || lower.contains(".mov")
                               || lower.contains(".m4v") || lower.contains(".webm"))

        if let url, isGIF {
            AnimatedImageView(url: url, contentMode: .scaleAspectFit)
                .frame(maxWidth: 240)
                .frame(height: 180)
                .background(Theme.Colors.bgSecondary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        } else if let url, isImage {
            Button { onTapImage(url) } label: {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFit()
                } placeholder: {
                    Rectangle().fill(Theme.Colors.bgSecondary)
                        .frame(width: 220, height: 160)
                }
                .frame(maxWidth: 260, maxHeight: 320)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        } else if let url, isVideo {
            Button { onPlayVideo(url) } label: {
                ZStack {
                    Rectangle().fill(Theme.Colors.bgSecondary)
                        .frame(width: 220, height: 160)
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.white.opacity(0.95))
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        } else if let url, isHTTP {
            VStack(alignment: .leading, spacing: 6) {
                LinkifiedText(content: message.content)
                LinkPreviewCard(url: url)
            }
        } else {
            LinkifiedText(content: message.content)
        }
    }

    private func timeString(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }
}

/// Renders a message body where http(s) links become real tappable links.
private struct LinkifiedText: View {
    let content: String
    var body: some View {
        if let attributed = try? AttributedString(markdown: linkifyMarkdown(content)) {
            Text(attributed)
                .font(Theme.Fonts.body)
                .foregroundStyle(Theme.Colors.textPrimary)
                .tint(Theme.Colors.primary)
                .textSelection(.enabled)
        } else {
            Text(content)
                .font(Theme.Fonts.body)
                .foregroundStyle(Theme.Colors.textPrimary)
        }
    }

    private func linkifyMarkdown(_ s: String) -> String {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let nsRange = NSRange(s.startIndex..., in: s)
        var output = s
        var offset = 0
        detector?.enumerateMatches(in: s, options: [], range: nsRange) { result, _, _ in
            guard let result, let r = Range(result.range, in: s), let url = result.url else { return }
            let original = String(s[r])
            let replacement = "[\(original)](\(url.absoluteString))"
            if let target = Range(NSRange(location: result.range.location + offset, length: result.range.length), in: output) {
                output.replaceSubrange(target, with: replacement)
                offset += replacement.count - original.count
            }
        }
        return output
    }
}

// MARK: - Long-press action sheet

private struct MessageActionSheet: View {
    let message: ChatMessage
    let onReply: () -> Void
    let onCopy: () -> Void
    let onDelete: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Color.white.opacity(0.18))
                .frame(width: 36, height: 4)
                .padding(.top, 8)

            HStack(spacing: 14) {
                AvatarView(url: message.senderAvatarURL.flatMap(URL.init(string:)),
                           fallbackText: message.senderName ?? "?", size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(message.senderName ?? "Unknown")
                        .font(Theme.Fonts.bodyMedium)
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(message.content)
                        .font(.cubbly(13))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 6)

            Divider().background(Theme.Colors.divider)

            VStack(spacing: 0) {
                row(icon: "arrowshape.turn.up.left.fill", label: "Reply", action: onReply)
                divider
                row(icon: "doc.on.doc.fill", label: "Copy Text", action: onCopy)
                if let onDelete {
                    divider
                    row(icon: "trash.fill", label: "Delete", color: Theme.Colors.danger, action: onDelete)
                }
            }
            Spacer()
        }
        .background(Theme.Colors.bgSecondary)
    }

    private var divider: some View {
        Rectangle().fill(Theme.Colors.divider).frame(height: 1).padding(.leading, 50)
    }

    private func row(icon: String, label: String, color: Color = Theme.Colors.textPrimary, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(color == Theme.Colors.danger ? Theme.Colors.danger : Theme.Colors.textSecondary)
                    .frame(width: 22)
                Text(label)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(color)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Chat thread peek preview

/// Non-interactive visual stand-in for the current chat thread — shown as the
/// side-peek destination while the user drags the DM sidebar left. Pulls the
/// last opened conversation from the shared caches so the peek matches the
/// conversation the user is actually about to navigate back into.
struct ChatThreadPreview: View {
    @ObservedObject private var cache = ConversationsCache.shared
    @ObservedObject private var lastChat = LastChatStore.shared
    @ObservedObject private var presence = PresenceService.shared

    var body: some View {
        let conv: ConversationSummary? = {
            guard let id = lastChat.lastConversationID else { return nil }
            return cache.conversations.first(where: { $0.id == id })
        }()

        VStack(spacing: 0) {
            if let conv {
                HStack(spacing: 10) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .frame(width: 36, height: 36)

                    ZStack(alignment: .bottomTrailing) {
                        if conv.isGroup && conv.pictureURL == nil {
                            GroupAvatar(members: conv.members, size: 32)
                        } else {
                            AvatarView(url: conv.avatarURL,
                                       fallbackText: conv.displayName, size: 32)
                        }
                        if let other = conv.otherUser {
                            let live = presence.effectiveStatus(for: other.userID, storedStatus: other.status)
                            StatusDot(rawStatus: live,
                                      isOnline: presence.isOnline(other.userID),
                                      size: 10, borderColor: Theme.Colors.bgPrimary)
                                .offset(x: 2, y: 2)
                        }
                    }

                    VStack(alignment: .leading, spacing: 1) {
                        Text(conv.displayName)
                            .font(Theme.Fonts.bodyMedium)
                            .foregroundStyle(Theme.Colors.textPrimary)
                        if let other = conv.otherUser {
                            let live = presence.effectiveStatus(for: other.userID, storedStatus: other.status)
                            Text(live.capitalized)
                                .font(.cubbly(11))
                                .foregroundStyle(Theme.Colors.textSecondary)
                        }
                    }
                    Spacer()

                    HStack(spacing: 18) {
                        SVGIcon(name: "call", size: 20, tint: Theme.Colors.textSecondary)
                            .frame(width: 36, height: 36)
                        SVGIcon(name: "video-camera", size: 20, tint: Theme.Colors.textSecondary)
                            .frame(width: 36, height: 36)
                    }
                    .padding(.trailing, 12)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)

                Rectangle().fill(Theme.Colors.divider).frame(height: 1)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
        .allowsHitTesting(false)
    }
}
