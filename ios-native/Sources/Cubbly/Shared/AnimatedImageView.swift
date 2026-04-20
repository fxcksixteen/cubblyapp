import SwiftUI
import ImageIO
import UIKit

/// Renders animated GIFs/WebP via ImageIO. Uses aspect-fit for chat media when
/// requested and aspect-fill for banners/avatars.
struct AnimatedImageView: UIViewRepresentable {
    let url: URL
    var contentMode: UIView.ContentMode = .scaleAspectFill

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = contentMode
        view.clipsToBounds = true
        context.coordinator.lastURL = url
        load(into: view)
        return view
    }

    func updateUIView(_ uiView: UIImageView, context: Context) {
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
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data else { return }
            let image = Self.animatedImage(from: data) ?? UIImage(data: data)
            DispatchQueue.main.async {
                view.image = image
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
            let duration = unclamped > 0 ? unclamped : clamped
            return duration < 0.02 ? 0.1 : duration
        }

        if let png = props[kCGImagePropertyPNGDictionary] as? [CFString: Any],
           let duration = (png[kCGImagePropertyAPNGUnclampedDelayTime] as? NSNumber)?.doubleValue
            ?? (png[kCGImagePropertyAPNGDelayTime] as? NSNumber)?.doubleValue {
            return duration < 0.02 ? 0.1 : duration
        }

        return 0.1
    }
}
