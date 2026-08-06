import SwiftUI

/// Sheet shown from the new-chat (✏️) button on Home. Two tabs: DM (pick a
/// friend) and Group (multi-select + name).
struct NewChatSheet: View {
    var onCreated: (UUID) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: SessionStore

    enum Mode: String, CaseIterable, Identifiable { case dm = "Direct Message", group = "Group"; var id: String { rawValue } }
    @State private var mode: Mode = .dm
    @State private var friends: [FriendEntry] = []
    @State private var loading = true
    @State private var search = ""
    @State private var selected: Set<UUID> = []
    @State private var groupName = ""
    @State private var creating = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.top, 8)

                searchField
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                if mode == .group {
                    TextField("Group name (optional)", text: $groupName)
                        .font(Theme.Fonts.body)
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .padding(10)
                        .background(Theme.Colors.bgTertiary)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                }

                List {
                    ForEach(filtered) { f in
                        Button {
                            if mode == .dm {
                                Task { await createDM(other: f.profile.userID) }
                            } else {
                                if selected.contains(f.profile.userID) { selected.remove(f.profile.userID) }
                                else { selected.insert(f.profile.userID) }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                AvatarView(url: f.profile.avatarURL.flatMap(URL.init(string:)),
                                           fallbackText: f.profile.displayName, size: 36)
                                VStack(alignment: .leading) {
                                    Text(f.profile.displayName)
                                        .font(Theme.Fonts.bodyMedium)
                                        .foregroundStyle(Theme.Colors.textPrimary)
                                    Text("@\(f.profile.username)")
                                        .font(.system(size: 11))
                                        .foregroundStyle(Theme.Colors.textSecondary)
                                }
                                Spacer()
                                if mode == .group {
                                    Image(systemName: selected.contains(f.profile.userID) ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selected.contains(f.profile.userID) ? Theme.Colors.primary : Theme.Colors.textMuted)
                                }
                            }
                        }
                        .listRowBackground(Theme.Colors.bgPrimary)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Theme.Colors.bgPrimary)
            }
            .background(Theme.Colors.bgPrimary)
            .navigationTitle("New Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                if mode == .group {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(creating ? "Creating…" : "Create") {
                            Task { await createGroup() }
                        }
                        .disabled(selected.isEmpty || creating)
                    }
                }
            }
            .task { await load() }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            SVGIcon(name: "search", size: 14, tint: Theme.Colors.textMuted)
            TextField("Search friends", text: $search)
                .font(Theme.Fonts.bodySmall)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .padding(10)
        .background(Theme.Colors.bgTertiary)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var filtered: [FriendEntry] {
        let base = friends.filter { $0.friendship.status == "accepted" }
        guard !search.isEmpty else { return base }
        let q = search.lowercased()
        return base.filter {
            $0.profile.displayName.lowercased().contains(q) ||
            $0.profile.username.lowercased().contains(q)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        guard let me = session.currentUserID else { return }
        friends = (try? await FriendsRepository().listMine(currentUserID: me)) ?? []
    }

    private func createDM(other: UUID) async {
        guard let me = session.currentUserID else { return }
        let repo = ConversationsRepository()
        do {
            // Make sure a 1:1 DM exists (creates one if this is our first
            // interaction). We deliberately ignore the returned ID: on some
            // deployments the `create_dm_conversation` RPC returns any
            // conversation that happens to include both users, which can
            // resolve to a *group chat* the two are in together. That's why
            // picking a friend used to drop the user into the shared group
            // instead of the DM — cubblybot worked only because there's no
            // group to confuse it with.
            _ = try await repo.openOrCreateDM(with: other)

            // Re-resolve by scanning our own conversations for the non-group
            // thread whose sole other participant is this friend.
            let summaries = try await repo.listSummaries(currentUserID: me)
            let dmID = summaries.first {
                !$0.isGroup &&
                $0.members.count == 1 &&
                $0.members.first?.userID == other
            }?.id

            if let dmID {
                onCreated(dmID)
            } else {
                // Extremely unlikely — fall back to whatever the RPC said.
                let rpcID = try await repo.openOrCreateDM(with: other)
                onCreated(rpcID)
            }
            dismiss()
        } catch {
            print("[NewChat] DM failed:", error)
        }
    }

    private func createGroup() async {
        guard !selected.isEmpty else { return }
        creating = true; defer { creating = false }
        do {
            let id = try await ConversationsRepository().createGroup(name: groupName, memberIDs: Array(selected))
            onCreated(id); dismiss()
        } catch { print("[NewChat] group failed:", error) }
    }
}
