import Foundation
import UIKit
import AVFoundation

/// Shrinks user-picked photos and videos before they're shipped to
/// Supabase Storage so we don't bleed bandwidth/storage cost. A 4K HEIC
/// off an iPhone is ~6MB; a 30s 4K HDR clip can be 80MB+. We don't need
/// either of those in a chat bubble.
enum AttachmentCompressor {
    /// Returns the (possibly recoded) data + the file extension to use.
    /// On any failure we fall back to the original bytes/extension.
    static func compress(url: URL) async -> (data: Data, ext: String) {
        let ext = url.pathExtension.lowercased()
        let isImage = ["jpg","jpeg","png","heic","heif","webp"].contains(ext)
        let isVideo = ["mov","mp4","m4v"].contains(ext)
        do {
            let raw = try Data(contentsOf: url)
            if isImage, let img = UIImage(data: raw) {
                return (compressImage(img, original: raw), "jpg")
            }
            if isVideo, let compressed = await compressVideo(url: url) {
                return (compressed, "mp4")
            }
            return (raw, ext.isEmpty ? "bin" : ext)
        } catch {
            return ((try? Data(contentsOf: url)) ?? Data(), ext.isEmpty ? "bin" : ext)
        }
    }

    // MARK: Images
    private static func compressImage(_ img: UIImage, original: Data) -> Data {
        let maxSide: CGFloat = 1920
        let scale = min(1, maxSide / max(img.size.width, img.size.height))
        let target = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: target)
        let resized = renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: 0.82) ?? original
    }

    // MARK: Videos — re-encode to 720p H.264/AAC
    private static func compressVideo(url: URL) async -> Data? {
        let asset = AVURLAsset(url: url)
        guard let export = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPreset1280x720
        ) else { return nil }
        let outURL = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("cubbly-\(UUID().uuidString).mp4")
        export.outputURL = outURL
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true
        await export.export()
        guard export.status == .completed,
              let data = try? Data(contentsOf: outURL) else { return nil }
        try? FileManager.default.removeItem(at: outURL)
        return data
    }
}
