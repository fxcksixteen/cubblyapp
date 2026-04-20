import SwiftUI

/// Full-screen image viewer with pinch-to-zoom + swipe-down-to-dismiss.
/// Mirrors the web `ImageLightbox.tsx`.
struct ImageLightbox: View {
    let url: URL
    var onDismiss: () -> Void

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var dragOffset: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black
                .opacity(1 - min(abs(dragOffset.height) / CGFloat(400), CGFloat(0.85)))
                .ignoresSafeArea()

            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                case .failure:
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.white)
                default:
                    ProgressView().tint(.white)
                }
            }
            .scaleEffect(scale)
            .offset(x: offset.width + dragOffset.width,
                    y: offset.height + dragOffset.height)
            .gesture(
                MagnificationGesture()
                    .onChanged { v in scale = max(1, min(lastScale * v, 5)) }
                    .onEnded { _ in
                        lastScale = scale
                        if scale <= 1 { withAnimation(.spring()) { offset = .zero } }
                    }
            )
            .simultaneousGesture(
                DragGesture()
                    .onChanged { v in
                        if scale > 1 {
                            offset.width += v.translation.width - dragOffset.width
                            offset.height += v.translation.height - dragOffset.height
                            dragOffset = v.translation
                        } else {
                            dragOffset = v.translation
                        }
                    }
                    .onEnded { v in
                        if scale <= 1 && abs(v.translation.height) > 120 {
                            onDismiss()
                        }
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                            dragOffset = .zero
                        }
                    }
            )
            .onTapGesture(count: 2) {
                withAnimation(.spring()) {
                    if scale > 1 { scale = 1; lastScale = 1; offset = .zero }
                    else { scale = 2.5; lastScale = 2.5 }
                }
            }

            VStack {
                HStack {
                    Spacer()
                    Button {
                        onDismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(.black.opacity(0.45)))
                    }
                    .padding(.trailing, 16)
                    .padding(.top, 12)
                }
                Spacer()
            }
        }
        .statusBarHidden(true)
    }
}
