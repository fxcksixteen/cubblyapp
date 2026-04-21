import Foundation
import UIKit

enum BrandAsset {
    static func uiImage(named name: String) -> UIImage? {
        if let image = UIImage(named: name) {
            return image
        }

        for ext in ["png", "jpg", "jpeg", "webp"] {
            if let url = bundledURL(named: name, ext: ext, preferredSubdirectories: ["Images", nil]) {
                return UIImage(contentsOfFile: url.path)
            }
        }

        return nil
    }

    static func bundledURL(named name: String, ext: String, preferredSubdirectories: [String?] = [nil]) -> URL? {
        for subdirectory in preferredSubdirectories {
            if let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: subdirectory) {
                return url
            }
        }

        guard let resourcePath = Bundle.main.resourcePath else { return nil }
        let fm = FileManager.default
        if let enumerator = fm.enumerator(atPath: resourcePath) {
            for case let path as String in enumerator
            where path.hasSuffix("/\(name).\(ext)") || path == "\(name).\(ext)" {
                return URL(fileURLWithPath: resourcePath).appendingPathComponent(path)
            }
        }

        return nil
    }
}