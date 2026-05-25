import SwiftUI

/// My Account settings — parity with web/desktop. Lists editable account
/// fields (display name, username, email, about me) and nests Name Colors
/// and Badges as their own sub-menus instead of dumping every shop item.
struct AccountSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: SessionStore

    @State private var displayName: String = ""
    @State private var username: String = ""
    @State private var email: String = ""
    @State private var bio: String = ""
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    fieldsSection
                    cosmeticsSection
                }
                .padding(16)
                .padding(.bottom, 40)
            }
            .background(Theme.Colors.bgPrimary.ignoresSafeArea())
            .navigationTitle("My Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(saving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(saving || !hasChanges)
                }
            }
            .onAppear(perform: loadInitial)
            .alert("Couldn't save", isPresented: .constant(error != nil), actions: {
                Button("OK") { error = nil }
            }, message: { Text(error ?? "") })
        }
    }

    // MARK: - Fields

    private var fieldsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PROFILE").font(.cubbly(11, .bold)).foregroundStyle(Theme.Colors.textSecondary)
            VStack(spacing: 10) {
                labeledField("Display Name") {
                    TextField("", text: $displayName).textInputAutocapitalization(.words)
                }
                labeledField("Username") {
                    TextField("", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                labeledField("Email") {
                    TextField("", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                labeledField("About Me", multiline: true) {
                    TextField("Tell people a bit about yourself", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
        }
    }

    @ViewBuilder
    private func labeledField<Content: View>(_ label: String, multiline: Bool = false, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.cubbly(10, .bold))
                .foregroundStyle(Theme.Colors.textSecondary)
            content()
                .font(Theme.Fonts.body)
                .foregroundStyle(Theme.Colors.textPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, multiline ? 10 : 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Colors.bgTertiary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Cosmetics sub-menus

    private var cosmeticsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PROFILE COSMETICS").font(.cubbly(11, .bold)).foregroundStyle(Theme.Colors.textSecondary)
            VStack(spacing: 0) {
                NavigationLink {
                    ShopCategoryListView(category: "name_color", title: "Name Colors")
                } label: {
                    cosmeticRow(icon: "paintpalette.fill", title: "Name Colors", subtitle: "Pick how your name appears")
                }
                Rectangle().fill(Theme.Colors.border).frame(height: 1).padding(.leading, 50)
                NavigationLink {
                    ShopCategoryListView(category: "badge", title: "Badges")
                } label: {
                    cosmeticRow(icon: "rosette", title: "Badges", subtitle: "Equip badges on your profile")
                }
            }
            .background(Theme.Colors.bgSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func cosmeticRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(Theme.Colors.textSecondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.Fonts.bodyMedium).foregroundStyle(Theme.Colors.textPrimary)
                Text(subtitle).font(Theme.Fonts.caption).foregroundStyle(Theme.Colors.textMuted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Colors.textMuted)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    // MARK: - Load / save

    private var originalEmail: String {
        SupabaseManager.shared.client.auth.currentUser?.email ?? ""
    }

    private var hasChanges: Bool {
        guard let p = session.currentProfile else { return false }
        return displayName != p.displayName
            || username != p.username
            || email != originalEmail
            || bio != (p.bio ?? "")
    }

    private func loadInitial() {
        guard let p = session.currentProfile else { return }
        displayName = p.displayName
        username = p.username
        bio = p.bio ?? ""
        email = originalEmail
    }

    private func save() async {
        guard let uid = session.currentUserID else { return }
        saving = true
        defer { saving = false }
        let client = SupabaseManager.shared.client
        do {
            var updates: [String: String] = [:]
            if let p = session.currentProfile {
                if displayName != p.displayName { updates["display_name"] = displayName }
                if username != p.username { updates["username"] = username }
                if bio != (p.bio ?? "") { updates["bio"] = bio }
            }
            if !updates.isEmpty {
                try await client.from("profiles").update(updates).eq("user_id", value: uid).execute()
            }
            if email != originalEmail, !email.isEmpty {
                try await client.auth.update(user: UserAttributes(email: email))
            }
            await session.reloadProfile()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Sub-screen used by the My Account cosmetic links. Lists every shop item
/// in a single category with equip/unequip controls — mirrors what desktop
/// shows inside the My Account → Name Colors / Badges panel.
struct ShopCategoryListView: View {
    let category: String
    let title: String
    @EnvironmentObject private var session: SessionStore
    @ObservedObject private var shop = ShopStore.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                let items = shop.items.filter { $0.category == category }
                if items.isEmpty {
                    Text("Nothing here yet — check back later.")
                        .font(Theme.Fonts.bodySmall)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .padding(.top, 24)
                } else {
                    ForEach(items) { row($0) }
                }
            }
            .padding(16)
        }
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { if let uid = session.currentUserID { await shop.start(userId: uid) } }
    }

    private func row(_ item: ShopStore.Item) -> some View {
        let owned = shop.owned.contains(item.id)
        let equipped = shop.equipped.contains(item.id)
        return HStack(spacing: 12) {
            preview(item)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(Theme.Fonts.bodyMedium).foregroundStyle(Theme.Colors.textPrimary)
                Text(owned ? (equipped ? "Equipped" : "Unlocked") : "Locked")
                    .font(Theme.Fonts.caption).foregroundStyle(Theme.Colors.textMuted)
            }
            Spacer()
            if owned {
                Button(equipped ? "Unequip" : "Equip") { Task { await shop.toggleEquip(item) } }
                    .font(.cubbly(12, .semibold))
                    .foregroundStyle(equipped ? Theme.Colors.textPrimary : .white)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(equipped ? Theme.Colors.bgTertiary : Theme.Colors.primary, in: Capsule())
            } else {
                HStack(spacing: 4) {
                    BundledAssetImage(name: "coin-stack").frame(width: 14, height: 14)
                    Text("\(item.price)")
                }
                .font(.cubbly(12, .semibold)).foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .padding(12)
        .background(Theme.Colors.bgSecondary)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(equipped ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func preview(_ item: ShopStore.Item) -> some View {
        if let asset = ShopArtwork.badgeAssetName(for: item.id) {
            BundledAssetImage(name: asset).frame(width: 42, height: 42)
        } else {
            let cfg = item.config?.jsonDictionary ?? [:]
            let c = (cfg["color"] as? String).flatMap(hexColor) ?? (cfg["from"] as? String).flatMap(hexColor) ?? Theme.Colors.primary
            Circle().fill(c).frame(width: 34, height: 34)
        }
    }

    private func hexColor(_ s: String) -> Color? {
        var h = s; if h.hasPrefix("#") { h.removeFirst() }
        guard let v = UInt32(h, radix: 16) else { return nil }
        return Color(hex: v)
    }
}
