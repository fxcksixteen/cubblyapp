import SwiftUI

/// Far-left vertical rail (Discord-style). Currently a Cubbly home pill +
/// divider; ready to host real servers later.
struct ServerRail: View {
    var body: some View {
        VStack(spacing: 10) {
            // Cubbly home pill
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(LinearGradient(
                        colors: [Theme.Colors.primary, Theme.Colors.primaryGlow],
                        startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 44, height: 44)
                Text("🧸").font(.system(size: 22))
            }
            Rectangle().fill(Theme.Colors.divider).frame(width: 24, height: 1)
            // Add-server placeholder
            ZStack {
                Circle().fill(Theme.Colors.bgSecondary).frame(width: 44, height: 44)
                Image(systemName: "plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.Colors.success)
            }
            Spacer()
        }
        .padding(.top, 14)
        .frame(width: 64)
        .background(Theme.Colors.bgTertiary.ignoresSafeArea(edges: .vertical))
    }
}
