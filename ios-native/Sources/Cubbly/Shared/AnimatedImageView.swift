import SwiftUI
import ImageIO
import UIKit

/// Renders animated GIFs/WebP via ImageIO. Reports `intrinsicContentSize = .zero`
/// so loading a tall GIF never expands its parent layout (You-tab banner fix).
struct AnimatedImageView: UIViewRepresentable {
    let url: URL
    var contentMode: UIView.ContentMode = .scaleAspectFill

    func makeUIView(context: Context) -> NoIntrinsicImageView {
        let view = NoIntrinsicImageView()
        view.contentMode = contentMode
        view.clipsToBounds = true
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultLow, for: .vertical)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        context.coordinator.lastURL = url
        load(into: view)
        return view
    }

    func updateUIView(_ uiView: NoIntrinsicImageView, context: Context) {
        uiView.contentMode = contentMode
        guard context.coordinator.lastURL != url else { return }
        context.coordinator.lastURL = url
        uiView.image = nil
        load(into: uiView)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var lastURL: URL?
    }

    private func load(into view: UIImageView) {
        if let cached = AnimatedImageCache.shared.image(for: url) {
            view.image = cached
            if cached.images?.isEmpty == false { view.startAnimating() }
            return
        }
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data else { return }
            let image = Self.cachedAnimatedImage(from: data, for: url)
            DispatchQueue.main.async {
                view.image = image
                if image?.images?.isEmpty == false { view.startAnimating() }
            }
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
        if totalDuration <= 0 { totalDuration = Double(count) * 0.1 }
        return UIImage.animatedImage(with: images, duration: totalDuration)
    }

    private static func frameDuration(at index: Int, source: CGImageSource) -> TimeInterval {
        guard let props = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any] else { return 0.1 }
        if let gif = props[kCGImagePropertyGIFDictionary] as? [CFString: Any] {
            let unclamped = (gif[kCGImagePropertyGIFUnclampedDelayTime] as? NSNumber)?.doubleValue ?? 0
            let clamped = (gif[kCGImagePropertyGIFDelayTime] as? NSNumber)?.doubleValue ?? 0
            let d = unclamped > 0 ? unclamped : clamped
            return d < 0.02 ? 0.1 : d
        }
        if let png = props[kCGImagePropertyPNGDictionary] as? [CFString: Any],
           let d = (png[kCGImagePropertyAPNGUnclampedDelayTime] as? NSNumber)?.doubleValue
                ?? (png[kCGImagePropertyAPNGDelayTime] as? NSNumber)?.doubleValue {
            return d < 0.02 ? 0.1 : d
        }
        return 0.1
    }

    static func cachedAnimatedImage(from data: Data, for url: URL) -> UIImage? {
        if let cached = AnimatedImageCache.shared.image(for: url) { return cached }
        guard let image = animatedImage(from: data) ?? UIImage(data: data) else { return nil }
        AnimatedImageCache.shared.store(image, for: url)
        return image
    }
}

/// UIImageView subclass that refuses to advertise an intrinsic size. SwiftUI
/// will then size it strictly via the .frame(...) modifiers we apply.
final class NoIntrinsicImageView: UIImageView {
    override var intrinsicContentSize: CGSize { .zero }
}

final class AnimatedImageCache {
    static let shared = AnimatedImageCache()
    private let cache = NSCache<NSURL, UIImage>()
    private init() { cache.totalCostLimit = 120 * 1024 * 1024 }
    func image(for url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func store(_ image: UIImage, for url: URL) {
        let cost = Int(image.size.width * image.size.height * 4)
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }
}
