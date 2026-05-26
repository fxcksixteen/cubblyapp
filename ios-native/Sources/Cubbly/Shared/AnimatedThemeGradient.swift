import SwiftUI

/// Reusable shifting linear gradient used by animated theme previews in the
/// Shop tab and by the app-root background tint when an animated theme is
/// equipped. Mirrors the web `shop-theme-aurora` CSS animation.
struct AnimatedThemeGradient: View {
    let colors: [Color]
    var duration: Double = 12
    @State private var phase: CGFloat = 0

    var body: some View {
        LinearGradient(
            colors: colors + [colors.first ?? .white],
            startPoint: UnitPoint(x: phase, y: 0.5),
            endPoint: UnitPoint(x: phase + 1.4, y: 0.5)
        )
        .onAppear {
            withAnimation(.linear(duration: duration).repeatForever(autoreverses: true)) {
                phase = -1
            }
        }
    }
}

/// Drifting starfield + occasional shooting-star streak used by the
/// `theme_space` shop preview and as the app background when Space is
/// equipped. Pure SwiftUI, no images — runs cheaply on the GPU.
struct SpaceThemeAnimated: View {
    @State private var drift: CGFloat = 0
    @State private var shoot: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            ZStack {
                RadialGradient(colors: [Color(hex: 0x0D1224), Color(hex: 0x07080C), Color(hex: 0x04050A)],
                               center: .topLeading,
                               startRadius: 2,
                               endRadius: max(geo.size.width, geo.size.height))
                ForEach(0..<60, id: \.self) { i in
                    let x = CGFloat((i * 53) % Int(max(1, geo.size.width)))
                    let y = CGFloat((i * 29) % Int(max(1, geo.size.height)))
                    Circle()
                        .fill(Color.white.opacity(i % 3 == 0 ? 0.85 : 0.45))
                        .frame(width: i % 5 == 0 ? 2 : 1, height: i % 5 == 0 ? 2 : 1)
                        .position(x: (x + drift).truncatingRemainder(dividingBy: geo.size.width), y: y)
                }
                Capsule()
                    .fill(LinearGradient(colors: [.white.opacity(0), .white.opacity(0.85), .white.opacity(0)],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: 60, height: 2)
                    .rotationEffect(.degrees(-22))
                    .position(x: shoot * geo.size.width, y: geo.size.height * 0.25)
                    .opacity(shoot > 0.05 && shoot < 0.95 ? 0.85 : 0)
            }
            .onAppear {
                withAnimation(.linear(duration: 30).repeatForever(autoreverses: false)) {
                    drift = geo.size.width
                }
                withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: false).delay(2)) {
                    shoot = 1
                }
            }
        }
    }
}
