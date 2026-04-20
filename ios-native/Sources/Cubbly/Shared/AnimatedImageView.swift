import SwiftUI
import ImageIO
import UIKit

/// Renders animated GIFs/WebP via ImageIO. Used by chat bubbles AND the You
/// tab banner so animated avatars/banners actually move.
struct AnimatedImageView: UIViewRepresentable {
    let url: URL
    var contentMode: UIView.ContentMode = .scaleAspectFill

    func makeUIView(context: Context) -> UIImageView {
        let v = UIImageView()
        v.contentMode = contentMode
        v.clipsToBounds = true
        load(into: v)
        return v
    }

    func updateUIView(_ uiView: UIImageView, context: Context) {
        if context.coordinator.lastURL != url {
            context.coordinator.lastURL = url
            load(into: uiView)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    final class Coordinator { var lastURL: URL; init(url: URL) { self.lastURL = url } }

    private func load(into view: UIImageView) {
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data else { return }
            let img = Self.animatedImage(from: data) ?? UIImage(data: data)
            DispatchQueue.main.async { view.image = img }
        }.resume()
    }

    static func animatedImage(from data: Data) -> UIImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let count = CGImageSourceGetCount(src)
        guard count > 1 else { return UIImage(data: data) }

        var images: [UIImage] = []
        var totalDuration: TimeInterval = 0
        for i in 0..<count {
            guard let cg = CGImageSourceCreateImageAtIndex(src, i, nil) else { continue }
            images.append(UIImage(cgImage: cg))
            totalDuration += frameDuration(at: i, source: src)
        }
        return UIImage.animatedImage(with: images, duration: totalDuration)
    }

    private static func frameDuration(at index: Int, source: CGImageSource) -> TimeInterval {
        guard let props = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
              let gif = props[kCGImagePropertyGIFDictionary] as? [CFString: Any] else { return 0.1 }
        let unclamped = (gif[kCGImagePropertyGIFUnclampedDelayTime] as? NSNumber)?.doubleValue ?? 0
        let clamped = (gif[kCGImagePropertyGIFDelayTime] as? NSNumber)?.doubleValue ?? 0
        let d = unclamped > 0 ? unclamped : clamped
        return d < 0.02 ? 0.1 : d
    }
}
