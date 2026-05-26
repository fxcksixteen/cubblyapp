import SwiftUI

// MARK: - Animated theme gradient
//
// IMPORTANT: SwiftUI does **not** animate `LinearGradient.startPoint /
// endPoint` (or `RadialGradient.center`) through `withAnimation`. The only
// reliable way to get a continuously shifting gradient on iOS is to recompute
// the gradient every frame from a TimelineView clock. All animated shop
// surfaces in the app route through the helpers in this file so the
// "broken animation" class of bugs only has to be fixed once.

/// Reusable shifting linear gradient used by animated theme previews in the
/// Shop tab and by the app-root background tint when an animated theme is
/// equipped. Mirrors the web `shop-theme-aurora` CSS animation.
struct AnimatedThemeGradient: View {
    let colors: [Color]
    var duration: Double = 8

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            // Triangle wave 0…1…0 over `duration` seconds — equivalent to
            // CSS `animation-direction: alternate`.
            let cycle = (t.truncatingRemainder(dividingBy: duration)) / duration
            let phase = CGFloat(1 - abs(cycle * 2 - 1)) // 0 → 1 → 0

            LinearGradient(
                colors: colors + [colors.first ?? .white],
                startPoint: UnitPoint(x: phase - 0.2, y: 0.5),
                endPoint: UnitPoint(x: phase + 1.2, y: 0.5)
            )
        }
    }
}

// MARK: - Space theme

/// Drifting starfield + occasional shooting-star streak used by the
/// `theme_space` shop preview and as the app background when Space is
/// equipped. Uses `Canvas` driven by a `TimelineView` so positions actually
/// recompute every frame (the previous SwiftUI `withAnimation` approach
/// silently no-ops on `.position`).
struct SpaceThemeAnimated: View {
    /// Stable per-instance seed so the star layout doesn't reshuffle on
    /// every redraw. Generated once and captured in `@State`.
    @State private var stars: [Star] = SpaceThemeAnimated.makeStars(count: 70)

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                Canvas { ctx, size in
                    // Deep space background — radial indigo → black so the
                    // preview reads "space" instead of "dark gray + dots".
                    let bgRect = CGRect(origin: .zero, size: size)
                    ctx.fill(Path(bgRect), with: .color(Color(hex: 0x05060C)))

                    let gradient = Gradient(colors: [
                        Color(hex: 0x1B1438).opacity(0.95),
                        Color(hex: 0x0B0820).opacity(0.85),
                        Color(hex: 0x05060C).opacity(1.0)
                    ])
                    ctx.fill(
                        Path(bgRect),
                        with: .radialGradient(
                            gradient,
                            center: CGPoint(x: size.width * 0.25, y: size.height * 0.2),
                            startRadius: 0,
                            endRadius: max(size.width, size.height)
                        )
                    )

                    // Subtle nebula blobs.
                    let nebula1 = Gradient(colors: [
                        Color(hex: 0x6B46C1).opacity(0.35),
                        Color.clear
                    ])
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: size.width * 0.55, y: size.height * 0.45,
                                               width: size.width * 0.7, height: size.height * 0.55)),
                        with: .radialGradient(
                            nebula1,
                            center: CGPoint(x: size.width * 0.9, y: size.height * 0.7),
                            startRadius: 0,
                            endRadius: size.width * 0.45
                        )
                    )
                    let nebula2 = Gradient(colors: [
                        Color(hex: 0x2563EB).opacity(0.25),
                        Color.clear
                    ])
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: -size.width * 0.2, y: -size.height * 0.1,
                                               width: size.width * 0.7, height: size.height * 0.6)),
                        with: .radialGradient(
                            nebula2,
                            center: CGPoint(x: size.width * 0.1, y: size.height * 0.1),
                            startRadius: 0,
                            endRadius: size.width * 0.4
                        )
                    )

                    // Stars drift slowly to the right; wrap around the width.
                    let driftSpeed: CGFloat = 6.0 // pts/sec
                    let offset = CGFloat(t).truncatingRemainder(dividingBy: 10_000) * driftSpeed
                    for star in stars {
                        let x = (star.x * size.width + offset).truncatingRemainder(dividingBy: max(size.width, 1))
                        let y = star.y * size.height
                        // Gentle twinkle.
                        let twinkle = 0.6 + 0.4 * sin(t * star.twinkleSpeed + star.phase)
                        let alpha = star.baseAlpha * twinkle
                        let r = star.radius
                        let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
                        ctx.fill(Path(ellipseIn: rect),
                                 with: .color(.white.opacity(alpha)))
                    }

                    // Shooting star — runs across the screen every ~8s with
                    // a quick visible window in the middle of each cycle.
                    let period: Double = 8.0
                    let shootCycle = (t.truncatingRemainder(dividingBy: period)) / period
                    let visible = shootCycle > 0.05 && shootCycle < 0.35
                    if visible {
                        let progress = (shootCycle - 0.05) / 0.30
                        let sx = CGFloat(progress) * size.width * 1.3 - size.width * 0.15
                        let sy = size.height * 0.18 + CGFloat(progress) * size.height * 0.15
                        let length: CGFloat = 70
                        var path = Path()
                        path.move(to: CGPoint(x: sx, y: sy))
                        path.addLine(to: CGPoint(x: sx - length, y: sy - length * 0.35))
                        let head = CGPoint(x: sx, y: sy)
                        let tail = CGPoint(x: sx - length, y: sy - length * 0.35)
                        ctx.stroke(
                            path,
                            with: .linearGradient(
                                Gradient(colors: [.white.opacity(0.95), .white.opacity(0)]),
                                startPoint: head,
                                endPoint: tail
                            ),
                            lineWidth: 2
                        )
                    }
                }
            }
        }
    }

    private struct Star {
        let x: CGFloat            // 0…1 fraction of width
        let y: CGFloat            // 0…1 fraction of height
        let radius: CGFloat
        let baseAlpha: Double
        let twinkleSpeed: Double
        let phase: Double
    }

    private static func makeStars(count: Int) -> [Star] {
        var rng = SystemRandomNumberGenerator()
        return (0..<count).map { _ in
            Star(
                x: CGFloat(Double.random(in: 0...1, using: &rng)),
                y: CGFloat(Double.random(in: 0...1, using: &rng)),
                radius: CGFloat(Double.random(in: 0.5...1.7, using: &rng)),
                baseAlpha: Double.random(in: 0.35...0.95, using: &rng),
                twinkleSpeed: Double.random(in: 0.8...2.4, using: &rng),
                phase: Double.random(in: 0...(2 * .pi), using: &rng)
            )
        }
    }
}

// MARK: - Animated gradient text (shared)

/// Shifting linear gradient text — used both by Shop previews and by
/// `CubblyNameText` for users who have an animated name color equipped.
/// Driven by `TimelineView` so the gradient actually moves on device.
struct AnimatedGradientText: View {
    let name: String
    let colors: [Color]
    var font: Font = .cubbly(16, .heavy)
    var duration: Double = 4

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let cycle = (t.truncatingRemainder(dividingBy: duration)) / duration
            let phase = CGFloat(cycle) * 2 - 1 // -1 → 1

            Text(name)
                .font(font)
                .foregroundStyle(
                    LinearGradient(
                        colors: colors + colors + [colors.first ?? .white],
                        startPoint: UnitPoint(x: phase, y: 0.5),
                        endPoint: UnitPoint(x: phase + 1, y: 0.5)
                    )
                )
                .lineLimit(1)
        }
    }
}
