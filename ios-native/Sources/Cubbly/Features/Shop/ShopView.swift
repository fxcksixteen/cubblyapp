import SwiftUI

struct ShopView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("Shop")
                .font(Theme.Fonts.title)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("Coming soon.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
    }
}
