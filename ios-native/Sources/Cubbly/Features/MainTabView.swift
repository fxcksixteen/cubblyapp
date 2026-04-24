import SwiftUI

/// Bottom tab bar — pixel-matches `MobileBottomNav.tsx` from the PWA, using
/// the actual Cubbly SVG icons via SVGKit.
struct MainTabView: View {
    enum Tab: Hashable { case home, friends, shop, you }
    @State private var selection: Tab = .home
    @StateObject private var presence = PresenceService.shared

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch selection {
                case .home:    DMListView()
                case .friends: FriendsView()
                case .shop:    ShopView()
                case .you:     YouView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .environmentObject(presence)

            CubblyTabBar(selection: $selection)
        }
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
    }
}

private struct CubblyTabBar: View {
    @Binding var selection: MainTabView.Tab

    var body: some View {
        HStack(spacing: 0) {
            tab(.home,    label: "Home",    icon: "home")
            tab(.friends, label: "Friends", icon: "friends")
            tab(.shop,    label: "Shop",    icon: "shop")
            tab(.you,     label: "You",     icon: "settings")
        }
        .frame(height: 56)
        .background(
            // Extend the bar background through the bottom safe area so it
            // visually docks to the phone's frame. The HStack itself still
            // sits above the home indicator thanks to the enclosing VStack's
            // safe-area handling, so only the paint bleeds down.
            Theme.Colors.bgSecondary
                .overlay(Rectangle().fill(Theme.Colors.border).frame(height: 1), alignment: .top)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func tab(_ t: MainTabView.Tab, label: String, icon: String) -> some View {
        let active = selection == t
        return Button {
            selection = t
        } label: {
            VStack(spacing: 2) {
                SVGIcon(name: icon, size: 22,
                        tint: active ? Theme.Colors.primary : Theme.Colors.textSecondary)
                Text(label)
                    .font(.cubbly(10, .semibold))
                    .foregroundStyle(active ? Theme.Colors.primary : Theme.Colors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 6)
            .overlay(alignment: .top) {
                if active {
                    Capsule().fill(Theme.Colors.primary).frame(width: 32, height: 2)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
