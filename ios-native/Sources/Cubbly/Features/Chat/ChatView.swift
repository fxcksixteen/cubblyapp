import SwiftUI
import PhotosUI
import Photos
import Supabase
import Realtime
import UniformTypeIdentifiers

/// Discord-iOS-style 1:1 / group chat. All messages left-aligned with avatar
/// + display name (just like Discord's mobile app), automatic infinite scroll
/// upward, long-press half-sheet for actions, in-app video player, link
/// previews, and tap-to-dismiss-keyboard.
struct ChatView: View {
    let conversation: ConversationSummary

    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase

    @State private var messages: [ChatMessage] = []
    @State private var callEvents: [CallEventRow] = []
    @State private var loading = true
    @State private var hasMore = false
    @State private var loadingOlder = false
    @State private var draft = ""
    @State private var replyingTo: ChatMessage?
    @State private var showGifPicker = false
    @State private var showAttachments = false
    @State private var showFilePicker = false
    @State private var showComposerMenu = false
    @State private var typingUserNames: [String] = []
    @State private var channel: RealtimeChannelV2?
    @State private var typingChannel: RealtimeChannelV2?
    @State private var callEventsChannel: RealtimeChannelV2?
    @State private var lastTypingBroadcast: Date = .distantPast
    @State private var actionSheetMessage: ChatMessage?
    @State private var videoURL: IdentifiedURL?
    @State private var lightboxURL: IdentifiedURL?
    @State private var profilePopupUserID: UUID?
    @State private var didInitialScroll = false
    @State private var scrollToBottomTrigger = UUID()
    @State private var pendingAttachments: [PendingChatAttachment] = []
    @FocusState private var composerFocused: Bool
    @StateObject private var reactions = MessageReactionsStore()
    @ObservedObject private var themeStore = ThemeStore.shared

    private let repo = MessagesRepository()

    var body: some View {
        VStack(spacing: 0) {
            header
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
            pendingAttachmentsBar
            composer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(chatBackground)
        // Custom header — fully hide the system nav bar so iOS 26 never
        // paints its default Liquid Glass buttons / centered title here.
        .navigationBarHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        // Re-enable Apple's native left-edge interactive-pop gesture even
        // though the nav bar is hidden, so swipe-back to the DM sidebar
        // matches Personal Notes 1:1.
        .nativeEdgeSwipeBack()
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
                enqueueAttachments(urls: urls)
            }
            .presentationDetents([.fraction(0.55), .large])
        }
        .sheet(item: $actionSheetMessage) { msg in
            MessageActionMenuView(
                message: msg,
                myReactions: Set(reactions.aggregated(for: UUID(uuidString: msg.id) ?? UUID())
                    .filter(\.reactedByMe).map(\.emoji)),
                onReact: { emoji in
                    if let id = UUID(uuidString: msg.id) {
                        Task { await reactions.toggle(messageId: id, emoji: emoji) }
                    }
                    actionSheetMessage = nil
                },
                onReply: { replyingTo = msg; actionSheetMessage = nil },
                onCopy:  { UIPasteboard.general.string = msg.content; actionSheetMessage = nil },
                onDelete: msg.senderID == session.currentUserID
                    ? { Task { await deleteMessage(msg) }; actionSheetMessage = nil }
                    : nil
            )
            .presentationDetents([.fraction(0.42), .medium])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(item: $videoURL) { item in
            InAppVideoPlayer(url: item.url)
        }
        .fullScreenCover(item: $lightboxURL) { item in
            ImageLightbox(url: item.url) { lightboxURL = nil }
        }
        .sheet(item: Binding(
            get: { profilePopupUserID.map { IdentifiedUUID(id: $0) } },
            set: { profilePopupUserID = $0?.id }
        )) { wrapper in
            ProfilePopupView(userID: wrapper.id)
                .environmentObject(presence)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .task {
            await reactions.start(conversationId: conversation.id,
                                  currentUserId: session.currentUserID)
            await loadInitial()
            await subscribe()
            await markRead()
            // Tell the notification service this conversation is now active so
            // we don't show a banner for messages that arrive while the user
            // is reading them.
            NotificationService.shared.activeConversationID = conversation.id
            // Mirror the web/desktop behavior: as soon as the user opens a
            // chat thread, drop its red unread bubble from the server rail
            // and stop incrementing it for newly-arriving messages.
            UnreadCountsStore.shared.activeConversationID = conversation.id
            UnreadCountsStore.shared.clearLocal(conversationID: conversation.id)
            // Hide the global custom tab bar while we're on a chat thread —
            // matches Discord/Telegram and stops it from eating vertical
            // space + competing with the message composer.
            ChromeStore.shared.tabBarHidden = true
        }
        .onDisappear {
            if NotificationService.shared.activeConversationID == conversation.id {
                NotificationService.shared.activeConversationID = nil
            }
            if UnreadCountsStore.shared.activeConversationID == conversation.id {
                UnreadCountsStore.shared.activeConversationID = nil
            }
            ChromeStore.shared.tabBarHidden = false
            Task {
                await RealtimeChannelFactory.remove(channel)
                await RealtimeChannelFactory.remove(typingChannel)
                await RealtimeChannelFactory.remove(callEventsChannel)
                await reactions.stop()
            }
        }
        // Safety net: realtime websockets occasionally drop silently on iOS
        // (especially after a long background suspension or a network flip),
        // which is why some peers were "stuck" on stale chat threads until
        // they backed out and re-entered. We resync the latest 50 messages
        // every 15s while the chat is on screen and immediately whenever the
        // app comes back to the foreground — and we re-subscribe the realtime
        // channel itself if it lost its connection.
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task {
                    await resyncLatestMessages()
                    await loadCallEvents()
                    // Re-subscribe in case the websocket died while suspended.
                    await RealtimeChannelFactory.remove(channel)
                    await RealtimeChannelFactory.remove(typingChannel)
                    await RealtimeChannelFactory.remove(callEventsChannel)
                    await subscribe()
                }
            }
        }
        .task(id: conversation.id) {
            // Slow background poll — guarantees liveness even if the realtime
            // channel is fully wedged. Sleeps cancel automatically when the
            // task is invalidated (e.g. switching chats / leaving the view).
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                if Task.isCancelled { break }
                await resyncLatestMessages()
            }
        }
    }

    // MARK: - Header

    /// Fully custom Discord-style chat header. We render this OURSELVES
    /// (no `.toolbar`) so iOS 26 never paints its default Liquid Glass
    /// buttons or centered nav title into the chat thread.
    private var header: some View {
        HStack(spacing: 8) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .frame(width: 32, height: 36)
            }
            .buttonStyle(.plain)

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

            VStack(alignment: .leading, spacing: 0) {
                Text(conversation.displayName)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .lineLimit(1)
                if let other = conversation.otherUser {
                    let live = presence.effectiveStatus(for: other.userID, storedStatus: other.status)
                    Text(live.capitalized)
                        .font(.cubbly(10))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            if !conversation.isGroup {
                Button { startVoiceCall() } label: {
                    SVGIcon(name: "call", size: 22, tint: Theme.Colors.textSecondary)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)

                Button { } label: {
                    SVGIcon(name: "video-camera", size: 22,
                            tint: Theme.Colors.textSecondary.opacity(0.45))
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                .disabled(true)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            themeStore.equippedShopThemeId != nil
                ? AnyView(Theme.Colors.bgPrimary.opacity(0.55))
                : AnyView(Theme.Colors.bgPrimary)
        )
        .overlay(Rectangle().fill(Theme.Colors.divider).frame(height: 1), alignment: .bottom)
    }

    /// Translucent chat background — when a Shop theme is equipped, drop the
    /// solid `bgPrimary` so the animated theme behind the tab stack actually
    /// shows through inside the chat thread.
    @ViewBuilder
    private var chatBackground: some View {
        if themeStore.equippedShopThemeId != nil {
            Theme.Colors.bgPrimary.opacity(0.55)
        } else {
            Theme.Colors.bgPrimary
        }
    }

    /// Pending attachments preview — Discord-style chip strip that sits ABOVE
    /// the composer while the user is staging files. Tapping × removes one.
    @ViewBuilder
    private var pendingAttachmentsBar: some View {
        if !pendingAttachments.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(pendingAttachments) { p in
                        PendingAttachmentChip(item: p) {
                            pendingAttachments.removeAll { $0.id == p.id }
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .background(Theme.Colors.bgSecondary)
            .overlay(Rectangle().fill(Theme.Colors.divider).frame(height: 1), alignment: .top)
        }
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
                    // The id is tied to the oldest loaded message so SwiftUI
                    // re-mounts the sentinel after each prepend and re-fires
                    // onAppear, allowing repeated upward pagination instead
                    // of stalling after the first batch.
                    let topSentinelId = "top-sentinel-\(messages.first?.id ?? "none")"
                    Color.clear.frame(height: 1)
                        .onAppear {
                            if hasMore && !loadingOlder { Task { await loadOlder() } }
                        }
                        .id(topSentinelId)

                    let items = timelineItems
                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                        switch item {
                        case .message(let m):
                            let prevMsg = previousMessage(in: items, before: idx)
                            let grouped = prevMsg?.senderID == m.senderID &&
                                (m.createdAt.timeIntervalSince(prevMsg?.createdAt ?? .distantPast) < 7 * 60)
                            DiscordStyleBubble(
                                message: m,
                                grouped: grouped,
                                currentUserID: session.currentUserID,
                                reactionsStore: reactions,
                                onLongPress: { actionSheetMessage = m },
                                onPlayVideo: { url in videoURL = IdentifiedURL(url: url) },
                                onTapImage: { url in lightboxURL = IdentifiedURL(url: url) },
                                onTapAvatar: { profilePopupUserID = m.senderID },
                                onSwipeReply: { replyingTo = m; composerFocused = true }
                            )
                            .id(m.id)
                            .padding(.horizontal, 10)
                        case .callEvent(let e):
                            CallEventPill(
                                conversationId: conversation.id,
                                event: .init(id: e.id, state: e.state,
                                             startedAt: e.startedAt, endedAt: e.endedAt),
                                onJoin: { joinCall(eventId: e.id, callerId: e.callerId) }
                            )
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .id("call-\(e.id.uuidString)")
                        }
                    }
                }
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .simultaneousGesture(TapGesture().onEnded { composerFocused = false })
            .onChange(of: messages.last?.id) { _, _ in
                // Only snap to the new last message — NOT on every count
                // change, otherwise prepending older messages while
                // paginating yanks the user back down to the bottom.
                if let last = messages.last?.id {
                    withAnimation(.easeOut(duration: 0.18)) {
                        proxy.scrollTo(last, anchor: .bottom)
                    }
                }
            }
            .onChange(of: composerFocused) { _, focused in
                // When the keyboard rises, snap to the latest message so the
                // user never loses their place behind the keyboard.
                if focused, let last = messages.last?.id {
                    // Slight delay so the layout has finished resizing for
                    // the keyboard before we scroll.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last, anchor: .bottom)
                        }
                    }
                }
            }
            .onAppear {
                if let last = messages.last?.id { proxy.scrollTo(last, anchor: .bottom) }
            }
            .onChange(of: scrollToBottomTrigger) { _, _ in
                // Forced jump to the true latest message after initial
                // hydration / re-entry. Multiple passes so the bubble layout
                // has settled (avatars, link previews, attachments loading
                // asynchronously) before each retry, otherwise the chat
                // appears "stuck" a few messages up from the latest.
                guard let last = messages.last?.id else { return }
                proxy.scrollTo(last, anchor: .bottom)
                for delay in [0.05, 0.18, 0.4, 0.8, 1.4] {
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                        proxy.scrollTo(last, anchor: .bottom)
                    }
                }
            }
        }
    }

    // Mixed timeline of messages + call events, sorted by created time.
    // IMPORTANT: we only show call pills that fall WITHIN the loaded message
    // window. Otherwise, scrolling up would surface very old call_events while
    // the matching messages haven't been paginated in yet — looking like the
    // chat history "vanished" leaving only call pills.
    private var timelineItems: [TimelineItem] {
        var items: [TimelineItem] = messages.map { .message($0) }
        let oldestLoadedMessage = messages.first?.createdAt
        let visibleCalls: [CallEventRow] = {
            guard hasMore, let cutoff = oldestLoadedMessage else { return callEvents }
            // Keep ongoing calls + any call newer than the oldest loaded message.
            return callEvents.filter { $0.state == "ongoing" || $0.startedAt >= cutoff }
        }()
        items.append(contentsOf: visibleCalls.map { .callEvent($0) })
        items.sort { $0.timestamp < $1.timestamp }
        return items
    }

    private func previousMessage(in items: [TimelineItem], before idx: Int) -> ChatMessage? {
        guard idx > 0 else { return nil }
        for i in stride(from: idx - 1, through: 0, by: -1) {
            if case .message(let m) = items[i] { return m }
        }
        return nil
    }

    private func joinCall(eventId: UUID, callerId: UUID) {
        guard let other = conversation.otherUser else { return }
        let store = CallStore.shared
        // Case 1: this is the call that's currently ringing US — accept it
        // through the normal incoming flow so we hook into the existing
        // call_event instead of creating a duplicate one.
        if let inc = store.incoming, inc.conversationId == conversation.id {
            Task { await store.acceptIncoming() }
            return
        }
        // Case 2: we're already in this exact call (tapped "Join" while
        // minimized) — just restore the full-screen UI.
        if store.state != .idle && store.conversationId == conversation.id {
            store.restore()
            return
        }
        // Case 3: try to join the existing ongoing call_event (no new ring,
        // no duplicate event). If no live peer is present, fall back to a
        // fresh outgoing call.
        Task {
            let joined = await store.tryJoinExisting(
                conversationId: conversation.id,
                peerId: other.userID,
                peerName: other.displayName,
                peerAvatarUrl: other.avatarURL,
                preferredCallEventId: eventId
            )
            if !joined {
                await store.startCall(
                    conversationId: conversation.id,
                    peerId: other.userID,
                    peerName: other.displayName,
                    peerAvatarUrl: other.avatarURL
                )
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
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                    showComposerMenu.toggle()
                }
                if showComposerMenu { composerFocused = false }
            } label: {
                ZStack {
                    Circle().fill(Theme.Colors.bgTertiary).frame(width: 36, height: 36)
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .rotationEffect(.degrees(showComposerMenu ? 45 : 0))
                        .animation(.spring(response: 0.35, dampingFraction: 0.7), value: showComposerMenu)
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

            let canSend = hasDraft || !pendingAttachments.isEmpty
            Button { Task { await send() } } label: {
                ZStack {
                    Circle()
                        .fill(canSend ? Theme.Colors.primary : Theme.Colors.bgTertiary)
                        .frame(width: 36, height: 36)
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(canSend ? .white : Theme.Colors.textMuted)
                }
            }
            .buttonStyle(.plain)
            .disabled(!canSend)
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Theme.Colors.bgPrimary)
        .overlay(Rectangle().fill(Theme.Colors.divider).frame(height: 1), alignment: .top)
        .confirmationDialog("Attach", isPresented: $showComposerMenu, titleVisibility: .hidden) {
            Button("Photo Library") {
                showComposerMenu = false
                showAttachments = true
            }
            Button("Attach File") {
                showComposerMenu = false
                showFilePicker = true
            }
            Button("GIF") {
                showComposerMenu = false
                showGifPicker = true
            }
            Button("Cancel", role: .cancel) { showComposerMenu = false }
        }
        .fileImporter(isPresented: $showFilePicker,
                      allowedContentTypes: [.item],
                      allowsMultipleSelection: true) { result in
            switch result {
            case .success(let urls):
                let copied: [URL] = urls.compactMap { src in
                    let didStart = src.startAccessingSecurityScopedResource()
                    defer { if didStart { src.stopAccessingSecurityScopedResource() } }
                    let dest = FileManager.default.temporaryDirectory
                        .appendingPathComponent("\(UUID().uuidString)-\(src.lastPathComponent)")
                    do {
                        try FileManager.default.copyItem(at: src, to: dest)
                        return dest
                    } catch {
                        print("[Chat] file import copy failed:", error)
                        return nil
                    }
                }
                if !copied.isEmpty { enqueueAttachments(urls: copied) }
            case .failure(let err):
                print("[Chat] file import failed:", err)
            }
        }
    }

    // MARK: - Voice call

    private func startVoiceCall() {
        guard let other = conversation.otherUser else { return }
        let avatar = other.avatarURL
        Task {
            await CallStore.shared.startCall(
                conversationId: conversation.id,
                peerId: other.userID,
                peerName: other.displayName,
                peerAvatarUrl: avatar
            )
        }
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
            await loadCallEvents()
            await reactions.load(messageIds: messages.compactMap { UUID(uuidString: $0.id) })
            // Force a hard snap to the newest message after first hydration
            // so the chat always opens at the bottom, even when opened from
            // the DM sidebar, a notification deep link, or a horizontal swipe.
            await MainActor.run {
                didInitialScroll = true
                scrollToBottomTrigger = UUID()
            }
        } catch is CancellationError {} catch {
            print("[Chat] load failed:", error)
        }
    }

    /// Pulls the newest 50 messages and merges anything we don't already have.
    /// Used as a safety net when the realtime websocket has silently dropped —
    /// e.g. iOS suspended the app, the network flipped, or the channel just
    /// died. Without this, peers can sit on a stale chat thread thinking
    /// nobody has replied. Called on scene-phase → .active and on a slow
    /// 15-second tick while the chat is open.
    private func resyncLatestMessages() async {
        do {
            let rows = try await repo.fetchPage(conversationID: conversation.id, limit: 50)
            let asc = Array(rows.reversed())
            // Hydrate first, then merge — never drop messages we already have.
            let hydrated = try await hydrate(asc)
            await MainActor.run {
                var merged = messages
                let existingIds = Set(merged.map { $0.id })
                var inserted = false
                for m in hydrated where !existingIds.contains(m.id) {
                    merged.append(m)
                    inserted = true
                }
                if inserted {
                    merged.sort { $0.createdAt < $1.createdAt }
                    messages = merged
                }
            }
            await reactions.load(messageIds: messages.compactMap { UUID(uuidString: $0.id) })
        } catch is CancellationError {} catch {
            print("[Chat] resync failed:", error)
        }
    }

    private func loadCallEvents() async {
        do {
            let rows: [CallEventRow] = try await SupabaseManager.shared.client
                .from("call_events")
                .select()
                .eq("conversation_id", value: conversation.id.uuidString)
                // Pull the newest rows first so the current ongoing call is
                // never dropped once a DM has a long call history, then sort
                // locally for the timeline render.
                .order("started_at", ascending: false)
                .limit(100)
                .execute()
                .value
            // Sweep: ask the server to close any "ongoing" call_event whose
            // participants haven't heartbeated in 30s. This collapses ghost
            // pills into "Call ended" without the user having to tap Join
            // first to discover the call is dead.
            await sweepStaleOngoingCalls(rows.filter { $0.state == "ongoing" })
            callEvents = normalizedCallEvents(rows)
        } catch {
            print("[Chat] loadCallEvents failed:", error)
        }
    }

    /// Best-effort: for each ongoing row, hit `end_call_event_if_stale`. If
    /// the RPC returns true, the row is now ended in the DB; the realtime
    /// UPDATE subscription on call_events will refresh our local list.
    private func sweepStaleOngoingCalls(_ ongoing: [CallEventRow]) async {
        guard !ongoing.isEmpty else { return }
        // Don't sweep the call WE'RE currently in.
        let myActive = CallStore.shared.currentCallEventId
        for row in ongoing where row.id != myActive {
            _ = try? await SupabaseManager.shared.client
                .rpc("end_call_event_if_stale", params: ["_call_event_id": row.id.uuidString])
                .execute()
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
            await reactions.load(messageIds: hydrated.compactMap { UUID(uuidString: $0.id) })
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
        let staged = pendingAttachments
        guard !trimmed.isEmpty || !staged.isEmpty else { return }
        draft = ""
        pendingAttachments = []
        if !staged.isEmpty {
            await sendAttachments(urls: staged.map(\.url), caption: trimmed)
        } else {
            await sendRaw(content: trimmed)
        }
    }

    /// Queue files for the user to review/caption before sending — Discord-,
    /// web-, and desktop-style behavior. Tapping send sends them all in a
    /// single message (with optional text caption).
    fileprivate func enqueueAttachments(urls: [URL]) {
        for url in urls {
            pendingAttachments.append(PendingChatAttachment(id: UUID(), url: url))
        }
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
    private func sendAttachments(urls: [URL], caption: String = "") async {
        guard !urls.isEmpty, let me = session.currentUserID else { return }
        let client = SupabaseManager.shared.client
        var attachments: [MessageAttachment] = []

        for u in urls {
            do {
                let (data, ext) = await AttachmentCompressor.compress(url: u)
                let name = u.lastPathComponent
                let path = "\(conversation.id.uuidString)/\(me.uuidString)-\(UUID().uuidString).\(ext)"
                _ = try await client.storage
                    .from("chat-attachments")
                    .upload(path, data: data, options: FileOptions(upsert: false))
                let signed = try await client.storage
                    .from("chat-attachments")
                    .createSignedURL(path: path, expiresIn: 60 * 60 * 24 * 7)
                attachments.append(MessageAttachment(
                    name: name,
                    url: signed,
                    path: path,
                    mimeType: Self.mimeType(forExtension: ext),
                    size: data.count,
                    width: nil,
                    height: nil
                ))
            } catch {
                print("[Chat] attachment upload failed:", error)
            }
        }

        guard !attachments.isEmpty else {
            print("[Chat] no attachments uploaded — aborting send")
            return
        }
        let payload = MessageAttachmentsParser.serialize(attachments, caption: caption)
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
        let ch = await RealtimeChannelFactory.make("messages:\(conversation.id.uuidString)")
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

        let tc = await RealtimeChannelFactory.make("typing:\(conversation.id.uuidString)")
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

        // Subscribe to call_events for this conversation so the in-thread
        // pill appears the moment a call starts and updates when it ends.
        let cc = await RealtimeChannelFactory.make("call_events:\(conversation.id.uuidString)")
        let callInserts = cc.postgresChange(
            InsertAction.self, schema: "public", table: "call_events",
            filter: "conversation_id=eq.\(conversation.id.uuidString)")
        let callUpdates = cc.postgresChange(
            UpdateAction.self, schema: "public", table: "call_events",
            filter: "conversation_id=eq.\(conversation.id.uuidString)")
        Task {
            for await action in callInserts {
                guard let row = try? action.decodeRecord(as: CallEventRow.self,
                                                         decoder: jsonDecoder()) else { continue }
                await MainActor.run {
                    if !callEvents.contains(where: { $0.id == row.id }) {
                        callEvents.append(row)
                    }
                    callEvents = normalizedCallEvents(callEvents)
                }
            }
        }
        Task {
            for await action in callUpdates {
                guard let row = try? action.decodeRecord(as: CallEventRow.self,
                                                         decoder: jsonDecoder()) else { continue }
                await MainActor.run {
                    if let idx = callEvents.firstIndex(where: { $0.id == row.id }) {
                        callEvents[idx] = row
                    } else {
                        callEvents.append(row)
                    }
                    callEvents = normalizedCallEvents(callEvents)
                }
            }
        }
        do { try await cc.subscribeWithError() }
        catch { print("[Chat] call_events channel subscribe failed:", error) }
        callEventsChannel = cc
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

    /// Keep the chat timeline stable and enforce Cubbly's invariant: only the
    /// newest ongoing call in a conversation can render as joinable. Older
    /// ghost/duplicate ongoing rows are visually closed instead of hiding the
    /// real current call behind history pagination.
    private func normalizedCallEvents(_ rows: [CallEventRow]) -> [CallEventRow] {
        let newestOngoingId = rows
            .filter { $0.state == "ongoing" }
            .max(by: { $0.startedAt < $1.startedAt })?
            .id
        return rows.map { row in
            if row.state == "ongoing", row.id != newestOngoingId {
                return row.endedCopy()
            }
            return row
        }
        .sorted { $0.startedAt < $1.startedAt }
    }
}

// MARK: - Helpers

struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct IdentifiedUUID: Identifiable {
    let id: UUID
}

/// One row from `public.call_events`.
struct CallEventRow: Codable, Identifiable, Hashable {
    let id: UUID
    let conversationId: UUID
    let callerId: UUID
    let state: String
    let startedAt: Date
    let endedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, state
        case conversationId = "conversation_id"
        case callerId = "caller_id"
        case startedAt = "started_at"
        case endedAt = "ended_at"
    }

    func endedCopy() -> CallEventRow {
        CallEventRow(id: id, conversationId: conversationId, callerId: callerId,
                     state: "ended", startedAt: startedAt, endedAt: endedAt ?? Date())
    }
}

/// Either a regular chat message or a call event, ordered by createdAt for
/// the unified chat timeline.
enum TimelineItem: Identifiable {
    case message(ChatMessage)
    case callEvent(CallEventRow)

    var id: String {
        switch self {
        case .message(let m): return "msg-\(m.id)"
        case .callEvent(let e): return "call-\(e.id.uuidString)"
        }
    }

    var timestamp: Date {
        switch self {
        case .message(let m): return m.createdAt
        case .callEvent(let e): return e.startedAt
        }
    }
}

// MARK: - Discord-style bubble

/// Discord iOS layout: every row is a left-aligned avatar + display name +
/// content stack. Mine and theirs look identical (no right-alignment, no
/// blue tint). Long-press triggers the half-sheet with options.
private struct DiscordStyleBubble: View {
    let message: ChatMessage
    let grouped: Bool
    let currentUserID: UUID?
    @ObservedObject var reactionsStore: MessageReactionsStore
    let onLongPress: () -> Void
    let onPlayVideo: (URL) -> Void
    let onTapImage: (URL) -> Void
    let onTapAvatar: () -> Void
    let onSwipeReply: () -> Void

    /// True while the user's finger is down during a potential long-press, so
    /// we can give Discord-style visual feedback (row tint + slight scale) and
    /// make it obvious which message they're targeting.
    @State private var isPressing: Bool = false
    /// Horizontal drag offset (only allowed leftwards). Drives the
    /// Discord-style swipe-to-reply animation.
    @State private var swipeOffset: CGFloat = 0
    @State private var didFireReplyHaptic = false

    /// Drag distance past which release fires the reply action.
    private let replyThreshold: CGFloat = 60

    private var msgUUID: UUID? { UUID(uuidString: message.id) }
    private var aggregated: [AggregatedReaction] {
        guard let id = msgUUID else { return [] }
        return reactionsStore.aggregated(for: id)
    }

    var body: some View {
        ZStack(alignment: .trailing) {
            // Reply arrow that fades in as the user drags leftwards.
            let progress = min(1, max(0, -swipeOffset / replyThreshold))
            ZStack {
                Circle()
                    .fill(Theme.Colors.primary.opacity(0.18 + 0.4 * Double(progress)))
                    .frame(width: 34, height: 34)
                Image(systemName: "arrowshape.turn.up.left.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(progress >= 1 ? Color.white : Theme.Colors.primary)
            }
            .opacity(progress)
            .scaleEffect(0.7 + 0.4 * progress)
            .padding(.trailing, 8)

            bubbleRow
                .offset(x: swipeOffset)
        }
        .contentShape(Rectangle())
        // Long-press only — a 0-distance DragGesture for "press feedback"
        // was eating every vertical scroll touch and freezing the chat
        // thread. Long-press alone is enough; SwiftUI handles its own
        // scroll-vs-press disambiguation.
        .onLongPressGesture(minimumDuration: 0.28, maximumDistance: 12, perform: {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            onLongPress()
        }, onPressingChanged: { pressing in
            isPressing = pressing
        })
        // Horizontal swipe-to-reply. minimumDistance:18 keeps vertical scroll
        // responsive — SwiftUI only routes the drag here once the gesture is
        // clearly horizontal. We also bail out when the touch starts within
        // the leftmost 24pt so the system's left-edge interactive-pop gesture
        // (swipe back to the DM sidebar) always wins on the edge strip.
        .gesture(
            DragGesture(minimumDistance: 18)
                .onChanged { value in
                    // Leave the left-edge strip to UIKit's pop gesture.
                    guard value.startLocation.x >= 24 else { return }
                    // Only react to predominantly-horizontal leftward drags.
                    guard abs(value.translation.width) > abs(value.translation.height),
                          value.translation.width < 0 else { return }
                    // Rubber-band past the threshold.
                    let raw = value.translation.width
                    let capped = max(raw, -120)
                    swipeOffset = capped
                    if !didFireReplyHaptic && capped <= -replyThreshold {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        didFireReplyHaptic = true
                    } else if capped > -replyThreshold {
                        didFireReplyHaptic = false
                    }
                }
                .onEnded { value in
                    guard value.startLocation.x >= 24 else { return }
                    let triggered = value.translation.width <= -replyThreshold
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                        swipeOffset = 0
                    }
                    didFireReplyHaptic = false
                    if triggered { onSwipeReply() }
                }
        )
    }

    private var bubbleRow: some View {
        HStack(alignment: .top, spacing: 10) {
            // Avatar (or spacer for grouped continuations)
            if grouped {
                Color.clear.frame(width: 40, height: 1)
            } else {
                Button(action: onTapAvatar) {
                    AvatarView(url: message.senderAvatarURL.flatMap(URL.init(string:)),
                               fallbackText: message.senderName ?? "?",
                               size: 40)
                        .padding(.top, 2)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 3) {
                if !grouped {
                    HStack(spacing: 6) {
                        CubblyNameText(
                            userId: message.senderID,
                            text: message.senderName ?? "Unknown",
                            font: Theme.Fonts.bodyMedium
                        )
                        Text(timeString(message.createdAt))
                            .font(.cubbly(10))
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                }

                if let r = message.replyTo {
                    // Discord-style replied-to pill: small connector line +
                    // arrow + @sender + 1-line content preview.
                    HStack(spacing: 6) {
                        Image(systemName: "arrowshape.turn.up.left.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Theme.Colors.textSecondary)
                        Text("@\(r.senderName)")
                            .font(.cubbly(12, .semibold))
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Text(replyPreview(r.content))
                            .font(.cubbly(12))
                            .foregroundStyle(Theme.Colors.textSecondary)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Theme.Colors.bgSecondary.opacity(0.6))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Theme.Colors.divider, lineWidth: 1)
                    )
                }

                content

                if !aggregated.isEmpty, let mid = msgUUID {
                    ReactionsPillRow(reactions: aggregated) { emoji in
                        Task { await reactionsStore.toggle(messageId: mid, emoji: emoji) }
                    }
                    .padding(.top, 2)
                }

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
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
        .padding(.top, grouped ? 1 : 6)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white.opacity(isPressing ? 0.06 : 0))
        )
        .scaleEffect(isPressing ? 0.97 : 1.0)
        .animation(.spring(response: 0.25, dampingFraction: 0.75), value: isPressing)
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
        // Web messages only persist a stable storage `path` — we need to sign
        // a fresh URL on every render (matches `AttachmentItem.tsx`). Older
        // messages may carry just a (possibly-expired) signed `url`.
        SignedAttachmentView(
            attachment: att,
            onTapImage: onTapImage,
            onPlayVideo: onPlayVideo
        )
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

    /// Strips out the `[attachments]...[/attachments]` block and returns a
    /// short text preview so reply pills don't show raw JSON.
    private func replyPreview(_ raw: String) -> String {
        if let parsed = MessageAttachmentsParser.parse(raw) {
            if !parsed.text.isEmpty { return parsed.text }
            return "📎 Attachment"
        }
        return raw
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

// MARK: - Discord-style long-press menu

/// Replaces the old plain action sheet. Shows the message preview, a
/// horizontal emoji slider for quick reactions, then Reply / Copy / Delete.
struct MessageActionMenuView: View {
    let message: ChatMessage
    let myReactions: Set<String>
    let onReact: (String) -> Void
    let onReply: () -> Void
    let onCopy: () -> Void
    let onDelete: (() -> Void)?

    @State private var showFullEmojiPicker = false

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Color.white.opacity(0.18))
                .frame(width: 36, height: 4)
                .padding(.top, 8)

            // Message preview header
            HStack(spacing: 14) {
                AvatarView(url: message.senderAvatarURL.flatMap(URL.init(string:)),
                           fallbackText: message.senderName ?? "?", size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    CubblyNameText(
                        userId: message.senderID,
                        text: message.senderName ?? "Unknown",
                        font: Theme.Fonts.bodyMedium
                    )
                    Text(previewText)
                        .font(.cubbly(13))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            // Horizontal emoji slider — quick reactions + a "+" tile that
            // opens the full system emoji keyboard for any-emoji reactions.
            HStack(spacing: 4) {
                ForEach(QuickReactions.all, id: \.self) { e in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        onReact(e)
                    } label: {
                        Text(e)
                            .font(.system(size: 28))
                            .frame(width: 44, height: 44)
                            .background(
                                Circle().fill(myReactions.contains(e)
                                              ? Theme.Colors.primary.opacity(0.25)
                                              : Color.clear)
                            )
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showFullEmojiPicker = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Theme.Colors.bgTertiary)
            )
            .padding(.horizontal, 14)
            .padding(.bottom, 8)

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
        .sheet(isPresented: $showFullEmojiPicker) {
            FullEmojiPickerView { emoji in
                onReact(emoji)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    private var previewText: String {
        if let parsed = MessageAttachmentsParser.parse(message.content) {
            return parsed.text.isEmpty ? "📎 Attachment" : parsed.text
        }
        return message.content
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

// MARK: - Reaction pills

/// Discord-style pill row shown beneath a chat bubble. Tapping toggles your
/// own reaction. The pill highlights when the current user has reacted.
struct ReactionsPillRow: View {
    let reactions: [AggregatedReaction]
    let onToggle: (String) -> Void

    var body: some View {
        HStack(spacing: 4) {
            ForEach(reactions) { r in
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onToggle(r.emoji)
                } label: {
                    HStack(spacing: 4) {
                        Text(r.emoji).font(.system(size: 13))
                        Text("\(r.count)")
                            .font(.cubbly(12, .semibold))
                            .foregroundStyle(r.reactedByMe
                                             ? Theme.Colors.textPrimary
                                             : Theme.Colors.textSecondary)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(r.reactedByMe
                                  ? Theme.Colors.primary.opacity(0.22)
                                  : Theme.Colors.bgSecondary)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(r.reactedByMe ? Theme.Colors.primary : Color.clear,
                                    lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
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
