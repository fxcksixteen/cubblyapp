import SwiftUI

/// Bottom tab bar — pixel-matches `MobileBottomNav.tsx` from the PWA, using
/// the same SVG icons (mapped through SVGIcon → SF Symbol equivalents).
struct MainTabView: View {
    enum Tab: Hashable { case home, friends, shop, you }
    @State private var selection: Tab = .home

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
            .padding(.bottom, 56)

            CubblyTabBar(selection: $selection)
        }
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
    }
}

private struct CubblyTabBar: View {
    @Binding var selection: MainTabView.Tab

    var body: some View {
        HStack(spacing: 0) {
            tab(.home,    label: "Home",    icon: "messages")
            tab(.friends, label: "Friends", icon: "friends")
            tab(.shop,    label: "Shop",    icon: "shop")
            tab(.you,     label: "You",     icon: "settings") // mapped to user/profile in v1.1
        }
        .frame(height: 56)
        .background(
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
                if t == .you {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(active ? Theme.Colors.primary : Theme.Colors.textSecondary)
                } else {
                    SVGIcon(name: icon, size: 20,
                            tint: active ? Theme.Colors.primary : Theme.Colors.textSecondary)
                }
                Text(label)
                    .font(.system(size: 10, weight: .semibold))
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
