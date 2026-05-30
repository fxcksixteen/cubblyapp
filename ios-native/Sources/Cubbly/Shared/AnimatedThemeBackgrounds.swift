import SwiftUI

// MARK: - Sky Dusk
//
// All three of these backgrounds use the `TimelineView` + `Canvas`
// approach already documented in `AnimatedThemeGradient.swift`: SwiftUI
// will NOT animate gradient stop positions through `withAnimation`, so we
// recompute every frame off a monotonic clock instead.

/// Soft dusk gradient with slowly drifting clouds.
struct SkyDuskAnimated: View {
    @State private var clouds: [Cloud] = SkyDuskAnimated.makeClouds()

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                Canvas { ctx, size in
                    // Dusk sky gradient — warm orange at the horizon fading
                    // into deep indigo at the top.
                    let bg = Gradient(stops: [
                        .init(color: Color(hex: 0x1B2658), location: 0.0),
                        .init(color: Color(hex: 0x4B3A78), location: 0.45),
                        .init(color: Color(hex: 0xE48A5E), location: 0.85),
                        .init(color: Color(hex: 0xF5BE7A), location: 1.0)
                    ])
                    ctx.fill(Path(CGRect(origin: .zero, size: size)),
                             with: .linearGradient(bg,
                                                   startPoint: .zero,
                                                   endPoint: CGPoint(x: 0, y: size.height)))

                    // Drifting clouds — wrap across the width.
                    for c in clouds {
                        let x = ((c.x + CGFloat(t) * c.speed)
                                 .truncatingRemainder(dividingBy: size.width + c.w + 200)) - c.w - 100
                        let y = c.y * size.height
                        let rect = CGRect(x: x, y: y, width: c.w, height: c.h)
                        let cloud = Gradient(colors: [
                            Color.white.opacity(c.alpha),
                            Color.white.opacity(0)
                        ])
                        ctx.fill(Path(ellipseIn: rect),
                                 with: .radialGradient(cloud,
                                                       center: CGPoint(x: rect.midX, y: rect.midY),
                                                       startRadius: 0,
                                                       endRadius: c.w * 0.55))
                    }
                }
            }
        }
    }

    private struct Cloud {
        let x: CGFloat
        let y: CGFloat        // 0…1 fraction of height
        let w: CGFloat
        let h: CGFloat
        let speed: CGFloat    // px / sec
        let alpha: Double
    }

    private static func makeClouds() -> [Cloud] {
        var rng = SystemRandomNumberGenerator()
        return (0..<6).map { _ in
            Cloud(
                x: CGFloat(Double.random(in: 0...800, using: &rng)),
                y: CGFloat(Double.random(in: 0.10...0.55, using: &rng)),
                w: CGFloat(Double.random(in: 180...340, using: &rng)),
                h: CGFloat(Double.random(in: 50...90, using: &rng)),
                speed: CGFloat(Double.random(in: 6...14, using: &rng)),
                alpha: Double.random(in: 0.30...0.55, using: &rng)
            )
        }
    }
}

// MARK: - Snowy Drift

/// Three layers of falling snowflakes over a cold night palette.
struct SnowyDriftAnimated: View {
    @State private var flakes: [Flake] = SnowyDriftAnimated.makeFlakes(count: 90)

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                Canvas { ctx, size in
                    let bg = Gradient(colors: [
                        Color(hex: 0x0E1A2C),
                        Color(hex: 0x1B2B45),
                        Color(hex: 0x2C4063)
                    ])
                    ctx.fill(Path(CGRect(origin: .zero, size: size)),
                             with: .linearGradient(bg,
                                                   startPoint: .zero,
                                                   endPoint: CGPoint(x: 0, y: size.height)))

                    for f in flakes {
                        let yProgress = ((CGFloat(t) * f.fallSpeed + f.yOffset)
                                         .truncatingRemainder(dividingBy: size.height + 40))
                        let sway = sin(t * f.swaySpeed + f.phase) * f.swayAmp
                        let x = f.x * size.width + sway
                        let y = yProgress - 20
                        let r = f.radius
                        ctx.fill(
                            Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                            with: .color(.white.opacity(f.alpha))
                        )
                    }
                }
            }
        }
    }

    private struct Flake {
        let x: CGFloat       // 0…1 fraction of width
        let yOffset: CGFloat
        let radius: CGFloat
        let fallSpeed: CGFloat    // px / sec
        let swaySpeed: Double
        let swayAmp: Double
        let phase: Double
        let alpha: Double
    }

    private static func makeFlakes(count: Int) -> [Flake] {
        var rng = SystemRandomNumberGenerator()
        return (0..<count).map { _ in
            Flake(
                x: CGFloat(Double.random(in: 0...1, using: &rng)),
                yOffset: CGFloat(Double.random(in: 0...1200, using: &rng)),
                radius: CGFloat(Double.random(in: 1.0...2.6, using: &rng)),
                fallSpeed: CGFloat(Double.random(in: 18...46, using: &rng)),
                swaySpeed: Double.random(in: 0.4...1.2, using: &rng),
                swayAmp: Double.random(in: 6...22, using: &rng),
                phase: Double.random(in: 0...(2 * .pi), using: &rng),
                alpha: Double.random(in: 0.55...0.95, using: &rng)
            )
        }
    }
}

// MARK: - Moonlit Hills

/// Layered hill silhouettes under a starry, moonlit night sky.
struct MoonlitHillsAnimated: View {
    @State private var stars: [Star] = MoonlitHillsAnimated.makeStars(count: 60)

    var body: some View {
        GeometryReader { geo in
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { context in
                let t = context.date.timeIntervalSinceReferenceDate
                Canvas { ctx, size in
                    // Night sky.
                    let sky = Gradient(colors: [
                        Color(hex: 0x070A1A),
                        Color(hex: 0x0E1438),
                        Color(hex: 0x1C2455)
                    ])
                    ctx.fill(Path(CGRect(origin: .zero, size: size)),
                             with: .linearGradient(sky,
                                                   startPoint: .zero,
                                                   endPoint: CGPoint(x: 0, y: size.height)))

                    // Moon with soft glow.
                    let moonR: CGFloat = 36
                    let moonCenter = CGPoint(x: size.width * 0.75, y: size.height * 0.22)
                    let glow = Gradient(colors: [
                        Color(hex: 0xF6F1D5).opacity(0.5),
                        Color.clear
                    ])
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: moonCenter.x - moonR * 3, y: moonCenter.y - moonR * 3,
                                               width: moonR * 6, height: moonR * 6)),
                        with: .radialGradient(glow,
                                              center: moonCenter,
                                              startRadius: moonR,
                                              endRadius: moonR * 3)
                    )
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: moonCenter.x - moonR, y: moonCenter.y - moonR,
                                               width: moonR * 2, height: moonR * 2)),
                        with: .color(Color(hex: 0xF7F1D8))
                    )

                    // Twinkling stars.
                    for star in stars {
                        let x = star.x * size.width
                        let y = star.y * size.height * 0.6 // stars confined to upper portion
                        let twinkle = 0.55 + 0.45 * sin(t * star.twinkleSpeed + star.phase)
                        let r = star.radius
                        ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                                 with: .color(.white.opacity(star.alpha * twinkle)))
                    }

                    // Three layered hill silhouettes — back to front, slightly
                    // brighter the closer they are.
                    drawHill(ctx: ctx, size: size, color: Color(hex: 0x14213D),
                             baseFrac: 0.62, amp: 26, freq: 2.1, phase: 0.0)
                    drawHill(ctx: ctx, size: size, color: Color(hex: 0x0E1A30),
                             baseFrac: 0.74, amp: 34, freq: 1.6, phase: 1.1)
                    drawHill(ctx: ctx, size: size, color: Color(hex: 0x070D1C),
                             baseFrac: 0.86, amp: 28, freq: 1.2, phase: 2.4)
                }
            }
        }
    }

    private func drawHill(ctx: GraphicsContext, size: CGSize, color: Color,
                          baseFrac: CGFloat, amp: CGFloat, freq: Double, phase: Double) {
        var path = Path()
        let baseY = size.height * baseFrac
        path.move(to: CGPoint(x: 0, y: size.height))
        path.addLine(to: CGPoint(x: 0, y: baseY))
        let steps = 60
        for i in 0...steps {
            let frac = Double(i) / Double(steps)
            let x = CGFloat(frac) * size.width
            let y = baseY - CGFloat(sin(frac * freq * .pi * 2 + phase)) * amp
            path.addLine(to: CGPoint(x: x, y: y))
        }
        path.addLine(to: CGPoint(x: size.width, y: size.height))
        path.closeSubpath()
        ctx.fill(path, with: .color(color))
    }

    private struct Star {
        let x: CGFloat
        let y: CGFloat
        let radius: CGFloat
        let alpha: Double
        let twinkleSpeed: Double
        let phase: Double
    }

    private static func makeStars(count: Int) -> [Star] {
        var rng = SystemRandomNumberGenerator()
        return (0..<count).map { _ in
            Star(
                x: CGFloat(Double.random(in: 0...1, using: &rng)),
                y: CGFloat(Double.random(in: 0...1, using: &rng)),
                radius: CGFloat(Double.random(in: 0.6...1.6, using: &rng)),
                alpha: Double.random(in: 0.4...0.95, using: &rng),
                twinkleSpeed: Double.random(in: 0.6...2.0, using: &rng),
                phase: Double.random(in: 0...(2 * .pi), using: &rng)
            )
        }
    }
}
