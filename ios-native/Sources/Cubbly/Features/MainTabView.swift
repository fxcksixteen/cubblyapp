import SwiftUI

/// Bottom tab bar — pixel-matches `MobileBottomNav.tsx`.
struct MainTabView: View {
    enum Tab: Hashable { case home, friends, shop, you }
    @State private var selection: Tab = .friends

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch selection {
                case .home:    DMListView()
                case .friends: FriendsView()
                case .shop:    ShopView()
                case .you:     YouView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, 56) // reserve space for the custom tab bar

            CubblyTabBar(selection: $selection)
        }
        .background(Theme.Colors.bgTertiary.ignoresSafeArea())
    }
}

private struct CubblyTabBar: View {
    @Binding var selection: MainTabView.Tab

    var body: some View {
        HStack(spacing: 0) {
            tabButton(.home,    label: "Home",    systemImage: "bubble.left.and.bubble.right.fill")
            tabButton(.friends, label: "Friends", systemImage: "person.2.fill")
            tabButton(.shop,    label: "Shop",    systemImage: "bag.fill")
            tabButton(.you,     label: "You",     systemImage: "person.crop.circle.fill")
        }
        .frame(height: 56)
        .background(
            Theme.Colors.bgSecondary
                .overlay(Rectangle().fill(Theme.Colors.border).frame(height: 1), alignment: .top)
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func tabButton(_ tab: MainTabView.Tab, label: String, systemImage: String) -> some View {
        let isActive = selection == tab
        return Button {
            selection = tab
        } label: {
            VStack(spacing: 2) {
                ZStack {
                    Image(systemName: systemImage)
                        .font(.system(size: 22))
                        .foregroundStyle(isActive ? Theme.Colors.primary : Theme.Colors.textSecondary)
                }
                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(isActive ? Theme.Colors.primary : Theme.Colors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, isActive ? 4 : 6)
            .overlay(alignment: .top) {
                if isActive {
                    Capsule().fill(Theme.Colors.primary).frame(width: 32, height: 2)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
