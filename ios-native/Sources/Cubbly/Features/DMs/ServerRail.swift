import SwiftUI

/// Far-left vertical rail (Discord-style). Currently a Cubbly home pill +
/// divider; ready to host real servers later. Uses the actual Cubbly logo
/// shipped in `Resources/Images/cubbly-logo.png` (matches web + desktop).
struct ServerRail: View {
    var body: some View {
        VStack(spacing: 10) {
            // Cubbly wordmark above the home pill (matches web + desktop).
            if let wm = UIImage(named: "cubbly-wordmark") {
                Image(uiImage: wm)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 56, height: 22)
                    .padding(.bottom, 2)
            }

            // Cubbly home pill — uses the real PNG logo.
            ZStack {
                if let img = UIImage(named: "cubbly-logo") {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 48, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .shadow(color: .black.opacity(0.25), radius: 6, x: 0, y: 4)
                } else {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(LinearGradient(
                            colors: [Theme.Colors.primary, Theme.Colors.primaryGlow],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 48, height: 48)
                        .overlay(Text("🧸").font(.system(size: 22)))
                }
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
