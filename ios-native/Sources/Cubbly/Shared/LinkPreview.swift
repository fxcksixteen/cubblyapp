import SwiftUI
import LinkPresentation

/// Inline link preview card backed by Apple's `LPLinkView`. Used in chat
/// bubbles whenever a message contains a single non-media URL.
struct LinkPreviewCard: View {
    let url: URL

    var body: some View {
        LPLinkViewRepresentable(url: url)
            .frame(maxWidth: 280)
            .frame(minHeight: 80, maxHeight: 220)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct LPLinkViewRepresentable: UIViewRepresentable {
    let url: URL
    func makeUIView(context: Context) -> LPLinkView {
        let v = LPLinkView(url: url)
        let provider = LPMetadataProvider()
        provider.startFetchingMetadata(for: url) { metadata, _ in
            guard let metadata else { return }
            DispatchQueue.main.async { v.metadata = metadata }
        }
        return v
    }
    func updateUIView(_ uiView: LPLinkView, context: Context) {}
}
