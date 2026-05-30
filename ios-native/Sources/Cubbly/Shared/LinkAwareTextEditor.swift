import SwiftUI
import UIKit

/// UITextView-backed editor that:
///   - Behaves like SwiftUI's `TextEditor` (two-way bound, multiline, scrolls).
///   - While **editing**, the user types plain text just like Notes on iOS.
///   - While **not editing**, http(s)/www URLs are auto-detected and become
///     tappable (opens Safari via UIKit's standard data-detector pipeline).
///
/// Matches how the web/desktop Personal Notes editor treats links: you type
/// them as plain text and they "come alive" once you're done editing.
struct LinkAwareTextEditor: UIViewRepresentable {
    @Binding var text: String
    var font: UIFont = .systemFont(ofSize: 15)
    var textColor: UIColor = UIColor.label
    var tintColor: UIColor = UIColor.systemBlue

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.delegate = context.coordinator
        tv.backgroundColor = .clear
        tv.font = font
        tv.textColor = textColor
        tv.tintColor = tintColor
        tv.isScrollEnabled = true
        tv.alwaysBounceVertical = true
        tv.textContainerInset = UIEdgeInsets(top: 8, left: 4, bottom: 12, right: 4)
        tv.textContainer.lineFragmentPadding = 0
        tv.autocapitalizationType = .sentences
        tv.autocorrectionType = .default
        tv.smartDashesType = .yes
        tv.smartQuotesType = .yes
        tv.dataDetectorTypes = [.link]
        tv.isEditable = true
        tv.isSelectable = true
        tv.linkTextAttributes = [
            .foregroundColor: tintColor,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
        return tv
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        if uiView.text != text { uiView.text = text }
        uiView.font = font
        uiView.textColor = textColor
        uiView.tintColor = tintColor
        uiView.linkTextAttributes = [
            .foregroundColor: tintColor,
            .underlineStyle: NSUnderlineStyle.single.rawValue,
        ]
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: LinkAwareTextEditor
        init(_ parent: LinkAwareTextEditor) { self.parent = parent }

        func textViewDidChange(_ textView: UITextView) {
            parent.text = textView.text
        }

        func textViewDidBeginEditing(_ textView: UITextView) {
            // While editing UIKit hides detector styling and treats text as
            // editable plain text — exactly the behavior we want.
            textView.dataDetectorTypes = []
        }

        func textViewDidEndEditing(_ textView: UITextView) {
            // Re-enable detectors so URLs become tappable again.
            textView.dataDetectorTypes = [.link]
        }
    }
}
