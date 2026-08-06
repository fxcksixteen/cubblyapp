import Foundation

/// A chat message as it appears in the UI. Mirrors `Message` from
/// `src/hooks/useMessages.ts`. The DB row is decoded into `ChatMessageRow`
/// then enriched with sender + reply previews on the client.
struct ChatMessage: Identifiable, Hashable {
    enum Status: String { case sending, sent, delivered, failed }

    let id: String                // UUID string OR "temp-<n>" for optimistic
    let conversationID: UUID
    let senderID: UUID
    var content: String
    var createdAt: Date
    var replyToID: UUID?
    var replyTo: ReplyPreview?
    var senderName: String?
    var senderAvatarURL: String?
    var status: Status = .delivered

    var isOptimistic: Bool { id.hasPrefix("temp-") }

    struct ReplyPreview: Hashable {
        let id: UUID
        let senderID: UUID
        let senderName: String
        let content: String
    }
}

// MARK: - Attachments

/// One file attached to a message — mirrors the PWA's serialized shape stored
/// inside a message's `content` column (`[attachments]\n[{...},{...}]`).
///
/// The web app is liberal about which keys it sets, so every field is optional
/// and we try several common names (`url`/`signedUrl`/`publicUrl`, `type`/
/// `mimeType`/`contentType`, …). Anything we can't decode is ignored rather
/// than crashing the chat view.
struct MessageAttachment: Hashable {
    let name: String?
    let url: URL?
    /// Stable storage object path inside the private `chat-attachments` bucket
    /// (e.g. `<userId>/<filename>`). The web app stores this and signs a fresh
    /// URL on render — we mirror that behavior so old messages keep working.
    let path: String?
    let mimeType: String?
    let size: Int?
    let width: Int?
    let height: Int?

    var fileExtension: String {
        if let n = name, let dot = n.lastIndex(of: ".") {
            return String(n[n.index(after: dot)...]).lowercased()
        }
        if let p = path, let dot = p.lastIndex(of: ".") {
            return String(p[p.index(after: dot)...]).lowercased()
        }
        return url?.pathExtension.lowercased() ?? ""
    }

    var isImage: Bool {
        if let m = mimeType?.lowercased(), m.hasPrefix("image/") { return true }
        return ["png", "jpg", "jpeg", "webp", "gif", "heic", "heif"].contains(fileExtension)
    }

    var isVideo: Bool {
        if let m = mimeType?.lowercased(), m.hasPrefix("video/") { return true }
        return ["mp4", "mov", "m4v", "webm"].contains(fileExtension)
    }

    var isGIF: Bool {
        if mimeType?.lowercased() == "image/gif" { return true }
        return fileExtension == "gif"
    }
}

enum MessageAttachmentsParser {
    /// Web/desktop format: `[attachments]<JSON>[/attachments]` (with optional
    /// caption text before/after). Older iOS builds also produced
    /// `[attachments]\n<JSON>` without a closing tag — both are accepted.
    static func parse(_ content: String) -> (attachments: [MessageAttachment], text: String)? {
        let lower = content.lowercased()
        guard let openRange = lower.range(of: "[attachments]") else { return nil }

        // Caption text that appears BEFORE the attachments block.
        let leading = String(content[..<openRange.lowerBound])
        let afterOpen = String(content[openRange.upperBound...])

        // Find an optional `[/attachments]` close tag — everything between the
        // open tag and either the close tag (if present) or end-of-string is
        // the JSON payload + remainder.
        let payloadAndAfter: String
        let trailingAfterClose: String
        if let closeRange = afterOpen.lowercased().range(of: "[/attachments]") {
            payloadAndAfter = String(afterOpen[..<closeRange.lowerBound])
            trailingAfterClose = String(afterOpen[closeRange.upperBound...])
        } else {
            payloadAndAfter = afterOpen
            trailingAfterClose = ""
        }

        let scanInput = payloadAndAfter.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let (jsonString, remainder) = extractJSONArray(from: scanInput) else {
            return nil
        }
        guard let data = jsonString.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [Any] else {
            return nil
        }
        let attachments: [MessageAttachment] = raw.compactMap { entry in
            guard let dict = entry as? [String: Any] else { return nil }
            return decode(dict)
        }
        guard !attachments.isEmpty else { return nil }

        let combinedText = [
            leading.trimmingCharacters(in: .whitespacesAndNewlines),
            remainder.trimmingCharacters(in: .whitespacesAndNewlines),
            trailingAfterClose.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
            .filter { !$0.isEmpty }
            .joined(separator: "\n")

        return (attachments, combinedText)
    }

    /// Short preview string for DM rows, e.g. "Photo", "2 Photos", "Video".
    static func preview(for content: String) -> String? {
        guard let parsed = parse(content) else { return nil }
        let text = parsed.text
        let caption = text.isEmpty ? "" : ": \(text)"
        let images = parsed.attachments.filter(\.isImage).count
        let videos = parsed.attachments.filter(\.isVideo).count
        let others = parsed.attachments.count - images - videos

        if images > 0 && videos == 0 && others == 0 {
            return images == 1 ? "Photo\(caption)" : "\(images) Photos\(caption)"
        }
        if videos > 0 && images == 0 && others == 0 {
            return videos == 1 ? "Video\(caption)" : "\(videos) Videos\(caption)"
        }
        let total = parsed.attachments.count
        return total == 1 ? "Attachment\(caption)" : "\(total) Attachments\(caption)"
    }

    /// Re-serializes attachments into the canonical `[attachments]<JSON>[/attachments]`
    /// format used by the web/desktop app, so files sent from iOS render the
    /// same everywhere.
    static func serialize(_ attachments: [MessageAttachment], caption: String = "") -> String {
        let array: [[String: Any]] = attachments.map { a in
            var dict: [String: Any] = [:]
            if let n = a.name { dict["name"] = n }
            if let p = a.path { dict["path"] = p }
            if let u = a.url { dict["url"] = u.absoluteString }
            if let m = a.mimeType { dict["type"] = m }
            if let s = a.size { dict["size"] = s }
            if let w = a.width { dict["width"] = w }
            if let h = a.height { dict["height"] = h }
            return dict
        }
        let data = (try? JSONSerialization.data(withJSONObject: array)) ?? Data("[]".utf8)
        let json = String(data: data, encoding: .utf8) ?? "[]"
        let body = "[attachments]\(json)[/attachments]"
        let trailing = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        return trailing.isEmpty ? body : "\(body)\n\(trailing)"
    }

    // MARK: Private helpers

    private static func decode(_ dict: [String: Any]) -> MessageAttachment? {
        let name = (dict["name"] ?? dict["filename"] ?? dict["fileName"]) as? String
        let path = (dict["path"] ?? dict["storagePath"] ?? dict["storage_path"]) as? String
        let urlString = (dict["url"] ?? dict["signedUrl"] ?? dict["signed_url"]
                         ?? dict["publicUrl"] ?? dict["public_url"] ?? dict["href"]) as? String
        let url = urlString.flatMap { URL(string: $0) }
        let mime = (dict["type"] ?? dict["mimeType"] ?? dict["mime_type"]
                    ?? dict["contentType"] ?? dict["content_type"]) as? String
        let size = (dict["size"] as? Int) ?? (dict["size"] as? Double).map(Int.init)
        let width = (dict["width"] as? Int) ?? (dict["width"] as? Double).map(Int.init)
        let height = (dict["height"] as? Int) ?? (dict["height"] as? Double).map(Int.init)

        // Need at least one of: path (private bucket), url, or name.
        guard path != nil || url != nil || name != nil else { return nil }
        return MessageAttachment(name: name, url: url, path: path, mimeType: mime,
                                 size: size, width: width, height: height)
    }

    /// Scans `s` for a balanced JSON array starting at the first `[`. Properly
    /// skips brackets inside string literals so caption text can follow the
    /// array without confusing the parser.
    private static func extractJSONArray(from s: String) -> (String, String)? {
        guard let start = s.firstIndex(of: "[") else { return nil }
        var depth = 0
        var inString = false
        var escape = false
        var end: String.Index?
        for i in s.indices[start...] {
            let c = s[i]
            if escape { escape = false; continue }
            if inString {
                if c == "\\" { escape = true }
                else if c == "\"" { inString = false }
            } else {
                if c == "\"" { inString = true }
                else if c == "[" { depth += 1 }
                else if c == "]" {
                    depth -= 1
                    if depth == 0 { end = i; break }
                }
            }
        }
        guard let endIdx = end else { return nil }
        let jsonString = String(s[start...endIdx])
        let afterIdx = s.index(after: endIdx)
        let remainder = afterIdx < s.endIndex ? String(s[afterIdx...]) : ""
        return (jsonString, remainder)
    }
}

/// Raw DB row.
struct ChatMessageRow: Codable, Identifiable, Hashable {
    let id: UUID
    let conversationID: UUID
    let senderID: UUID
    let content: String
    let replyToID: UUID?
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, content
        case conversationID = "conversation_id"
        case senderID = "sender_id"
        case replyToID = "reply_to_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
