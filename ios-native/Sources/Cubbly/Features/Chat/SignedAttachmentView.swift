import SwiftUI

/// Renders a chat attachment from the private `chat-attachments` bucket.
/// Mirrors `src/components/app/chat/AttachmentItem.tsx`:
///
///   • If the attachment carries a stable storage `path`, we always mint a
///     fresh signed URL on render — old persisted signed URLs expire after
///     ~7 days and would otherwise show as broken images.
///   • If only a `url` is present (legacy iOS messages, external links), we
///     try to extract a storage path from it and re-sign; otherwise we use
///     the URL as-is.
struct SignedAttachmentView: View {
    let attachment: MessageAttachment
    let onTapImage: (URL) -> Void
    let onPlayVideo: (URL) -> Void

    @State private var resolvedURL: URL?
    @State private var failed: Bool = false

    var body: some View {
        Group {
            if let url = resolvedURL {
                content(for: url)
            } else if failed {
                fallbackChip
            } else {
                Rectangle()
                    .fill(Theme.Colors.bgSecondary)
                    .frame(width: 220, height: 160)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(ProgressView().tint(Theme.Colors.textMuted))
            }
        }
        .task(id: attachmentKey) {
            await resolve()
        }
    }

    private var attachmentKey: String {
        (attachment.path ?? "") + "|" + (attachment.url?.absoluteString ?? "")
    }

    @ViewBuilder
    private func content(for url: URL) -> some View {
        if attachment.isGIF {
            AnimatedImageView(url: url, contentMode: .scaleAspectFit)
                .frame(maxWidth: 240)
                .frame(height: 180)
                .background(Theme.Colors.bgSecondary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        } else if attachment.isImage {
            Button { onTapImage(url) } label: {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFit()
                    case .failure:
                        Rectangle().fill(Theme.Colors.bgSecondary)
                            .frame(width: 220, height: 160)
                            .overlay(
                                Image(systemName: "photo")
                                    .foregroundStyle(Theme.Colors.textMuted)
                            )
                    default:
                        Rectangle().fill(Theme.Colors.bgSecondary)
                            .frame(width: 220, height: 160)
                    }
                }
                .frame(maxWidth: 260, maxHeight: 320)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        } else if attachment.isVideo {
            Button { onPlayVideo(url) } label: {
                ZStack {
                    Rectangle().fill(Theme.Colors.bgSecondary)
                        .frame(width: 220, height: 160)
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.white.opacity(0.95))
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        } else {
            Link(destination: url) {
                HStack(spacing: 10) {
                    Image(systemName: "doc.fill")
                        .foregroundStyle(Theme.Colors.textSecondary)
                    Text(attachment.name ?? url.lastPathComponent)
                        .font(Theme.Fonts.bodyMedium)
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .lineLimit(1)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.Colors.bgSecondary)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    private var fallbackChip: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.Colors.textMuted)
            Text(attachment.name ?? "Attachment unavailable")
                .font(.cubbly(12))
                .foregroundStyle(Theme.Colors.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.Colors.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func resolve() async {
        // Recover a stable path either directly or from a previous signed URL.
        let path = attachment.path ?? Self.extractStoragePath(from: attachment.url)

        if let path {
            do {
                let signed = try await SupabaseManager.shared.client.storage
                    .from("chat-attachments")
                    .createSignedURL(path: path, expiresIn: 60 * 60 * 24)
                await MainActor.run {
                    self.resolvedURL = signed
                    self.failed = false
                }
                return
            } catch {
                print("[Attachment] failed to sign URL for \(path):", error)
            }
        }

        // External link or sign failed — use the URL as-is if we have one.
        if let url = attachment.url {
            await MainActor.run {
                self.resolvedURL = url
                self.failed = false
            }
        } else {
            await MainActor.run { self.failed = true }
        }
    }

    /// Pulls `<path>` out of a Supabase storage URL like
    /// `…/storage/v1/object/(sign|public|authenticated)/chat-attachments/<path>?…`.
    private static func extractStoragePath(from url: URL?) -> String? {
        guard let url else { return nil }
        let p = url.path
        let markers = [
            "/storage/v1/object/sign/chat-attachments/",
            "/storage/v1/object/public/chat-attachments/",
            "/storage/v1/object/authenticated/chat-attachments/",
        ]
        for marker in markers {
            if let r = p.range(of: marker) {
                let raw = String(p[r.upperBound...])
                return raw.removingPercentEncoding ?? raw
            }
        }
        return nil
    }
}
