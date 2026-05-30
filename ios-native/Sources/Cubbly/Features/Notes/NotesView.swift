import SwiftUI
import PhotosUI
import AVKit

/// Personal Notes — encrypted with the same PIN-derived key as web/desktop
/// so the same vault is unlocked by the same PIN across every platform.
struct NotesView: View {
    @StateObject private var store = NotesStore.shared
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        ZStack {
            Theme.Colors.bgPrimary.ignoresSafeArea()
            if store.isInitializing {
                ProgressView().tint(Theme.Colors.primary)
            } else if !store.hasKey {
                LockScreen(store: store)
            } else {
                NotesEditorScreen(store: store)
            }
        }
        .task {
            if let uid = session.currentUserID { await store.start(userId: uid) }
        }
    }
}

// MARK: - Lock / Setup

private struct LockScreen: View {
    @ObservedObject var store: NotesStore
    @State private var pin = ""
    @State private var confirmPin = ""
    @State private var step: Int = 1
    @State private var trust = true
    @State private var busy = false
    @State private var shake = false
    @State private var errorText: String?
    @FocusState private var pinFocused: Bool

    private var setup: Bool { (store.hasExistingVault ?? false) == false }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Theme.Colors.bgSecondary)
                    .frame(width: 78, height: 78)
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(Theme.Colors.primary)
            }
            Text(setup
                 ? (step == 1 ? "Create your PIN" : "Confirm your PIN")
                 : "Enter your PIN")
                .font(.cubbly(22, .bold))
                .foregroundStyle(Theme.Colors.textPrimary)
            Text(setup
                 ? "Choose a 4-digit PIN to protect your personal notes."
                 : "Same PIN you set on the web or desktop app.")
                .font(.cubbly(13))
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 28)

            ZStack {
                TextField("", text: step == 1 ? $pin : $confirmPin)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($pinFocused)
                    .foregroundStyle(.clear)
                    .tint(.clear)
                    .accentColor(.clear)
                    .frame(width: 220, height: 44)
                    .opacity(0.02)
                    .onChange(of: pin) { _, v in onPinChange(v, isConfirm: false) }
                    .onChange(of: confirmPin) { _, v in onPinChange(v, isConfirm: true) }

                PinDots(value: step == 1 ? pin : confirmPin)
                    .offset(x: shake ? -10 : 0)
                    .animation(.default.repeatCount(3, autoreverses: true).speed(6), value: shake)
                    .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .onTapGesture { pinFocused = true }

            Toggle(isOn: $trust) {
                Label("Trust this device — skip PIN next time", systemImage: "checkmark.shield.fill")
                    .font(.cubbly(12))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
            .tint(Theme.Colors.primary)
            .padding(.horizontal, 28)
            .padding(.top, 8)

            if let e = errorText {
                Text(e).font(.cubbly(12, .semibold)).foregroundStyle(.red)
            }
            if busy { ProgressView().tint(Theme.Colors.primary) }
            Spacer()
            Text("Notes are end-to-end encrypted.")
                .font(.cubbly(11))
                .foregroundStyle(Theme.Colors.textMuted)
                .padding(.bottom, 18)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { pinFocused = true }
        }
        .onChange(of: step) { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { pinFocused = true }
        }
    }

    private func onPinChange(_ v: String, isConfirm: Bool) {
        let digits = String(v.filter(\.isNumber).prefix(4))
        if isConfirm {
            if digits != confirmPin { confirmPin = digits }
            if digits.count == 4 { Task { await submitConfirm(digits) } }
        } else {
            if digits != pin { pin = digits }
            if digits.count == 4 { Task { await submitFirst(digits) } }
        }
    }

    private func submitFirst(_ v: String) async {
        errorText = nil
        if setup { step = 2; return }
        busy = true
        let ok = await store.unlock(pin: v, trust: trust)
        busy = false
        if !ok {
            shake.toggle()
            pin = ""
            errorText = "Wrong PIN"
        }
    }

    private func submitConfirm(_ v: String) async {
        errorText = nil
        if v != pin {
            shake.toggle()
            confirmPin = ""
            errorText = "PINs don't match — try again"
            return
        }
        busy = true
        do { try await store.setupVault(pin: v, trust: trust) }
        catch { errorText = "Couldn't create vault" }
        busy = false
    }
}

private struct PinDots: View {
    let value: String
    var body: some View {
        HStack(spacing: 16) {
            ForEach(0..<4, id: \.self) { i in
                let filled = i < value.count
                Circle()
                    .fill(filled ? Theme.Colors.primary : Theme.Colors.bgTertiary)
                    .overlay(Circle().stroke(filled ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1))
                    .frame(width: 22, height: 22)
            }
        }
    }
}

// MARK: - Editor

private struct NotesEditorScreen: View {
    @ObservedObject var store: NotesStore
    @State private var selectedID: UUID?
    @State private var pendingDelete: NoteRow?

    var body: some View {
        List {
            if store.notes.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "note.text").font(.system(size: 30)).foregroundStyle(Theme.Colors.textMuted)
                    Text("No notes yet")
                        .font(.cubbly(14, .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                    Text("Tap + to create your first private note.")
                        .font(.cubbly(11))
                        .foregroundStyle(Theme.Colors.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .listRowBackground(Color.clear)
            }
            ForEach(store.notes) { note in
                if note.decrypted != nil {
                    // Plain Button (not NavigationLink) so we only have ONE
                    // navigationDestination registration on this screen —
                    // prevents SwiftUI double-pushing (the "note opens,
                    // then Personal Notes reopens on top" bug).
                    Button { selectedID = note.id } label: {
                        NoteRowView(note: note)
                    }
                    .listRowBackground(Theme.Colors.bgSecondary)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            pendingDelete = note
                        } label: { Label("Delete", systemImage: "trash") }
                        Button {
                            Task { await store.togglePin(id: note.id, pinned: !note.pinned) }
                        } label: { Label(note.pinned ? "Unpin" : "Pin", systemImage: note.pinned ? "pin.slash" : "pin") }
                        .tint(.orange)
                    }
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "lock.trianglebadge.exclamationmark")
                            .foregroundStyle(.orange)
                        Text("Couldn't decrypt this note")
                            .font(.cubbly(13))
                            .foregroundStyle(Theme.Colors.textSecondary)
                    }
                    .listRowBackground(Theme.Colors.bgSecondary)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.Colors.bgPrimary)
        .navigationTitle("Personal Notes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    Button { store.lock() } label: { Label("Lock vault", systemImage: "lock.fill") }
                    Button(role: .destructive) {
                        store.forgetDevice()
                    } label: { Label("Forget this device", systemImage: "key.slash") }
                } label: {
                    Image(systemName: "ellipsis.circle").foregroundStyle(Theme.Colors.textSecondary)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task {
                        if let new = await store.createNote() {
                            selectedID = new.id
                        }
                    }
                } label: {
                    Image(systemName: "square.and.pencil").foregroundStyle(Theme.Colors.primary)
                }
            }
        }
        // Single destination registration — both row taps and the new-note
        // button drive it via `selectedID`. Native iOS swipe-back pops it.
        .navigationDestination(item: $selectedID) { id in
            NoteEditorView(store: store, noteID: id)
        }
        .alert("Delete note?", isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                if let n = pendingDelete {
                    Task { await store.deleteNote(id: n.id) }
                }
                pendingDelete = nil
            }
        } message: {
            Text("\"\(pendingDelete?.decrypted?.title.nonEmpty ?? "Untitled")\" will be permanently removed.")
        }
    }
}

private struct NoteRowView: View {
    let note: NoteRow
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if note.pinned {
                    Image(systemName: "pin.fill").font(.system(size: 11)).foregroundStyle(.orange)
                }
                Text(note.decrypted?.title.nonEmpty ?? "Untitled")
                    .font(.cubbly(15, .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .lineLimit(1)
                if let count = note.decrypted?.attachments?.count, count > 0 {
                    Image(systemName: "paperclip")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textMuted)
                    Text("\(count)")
                        .font(.cubbly(11, .semibold))
                        .foregroundStyle(Theme.Colors.textMuted)
                }
            }
            Text(plainPreview(note.decrypted?.body ?? "") )
                .font(.cubbly(12))
                .foregroundStyle(Theme.Colors.textSecondary)
                .lineLimit(2)
        }
        .padding(.vertical, 4)
    }

    private func plainPreview(_ html: String) -> String {
        var s = html
        s = s.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: "&nbsp;", with: " ")
        s = s.replacingOccurrences(of: "&amp;", with: "&")
        s = s.replacingOccurrences(of: "&lt;", with: "<")
        s = s.replacingOccurrences(of: "&gt;", with: ">")
        s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? "Empty note" : s
    }
}

// MARK: - Note Editor (with attachments)

private struct NoteEditorView: View {
    @ObservedObject var store: NotesStore
    let noteID: UUID
    @State private var title: String = ""
    @State private var noteBody: String = ""
    @State private var attachments: [NoteAttachment] = []
    @State private var loaded = false
    @State private var saveTask: Task<Void, Never>?
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var uploading = false
    @State private var uploadError: String?
    @State private var previewVideoURL: IdentifiedURL?
    @State private var previewImageData: IdentifiedData?
    @FocusState private var bodyFocused: Bool

    private var note: NoteRow? { store.notes.first(where: { $0.id == noteID }) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TextField("Title", text: $title)
                    .font(.cubbly(22, .bold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .padding(.horizontal, 16).padding(.top, 12)
                    .onChange(of: title) { _, _ in scheduleSave() }
                Divider().padding(.vertical, 8)

                if !attachments.isEmpty {
                    AttachmentsGrid(
                        attachments: attachments,
                        store: store,
                        onImageTap: { previewImageData = IdentifiedData(id: UUID(), data: $0) },
                        onVideoTap: { previewVideoURL = IdentifiedURL(url: $0) },
                        onRemove: { removeAttachment(id: $0) }
                    )
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
                }

                LinkAwareTextEditor(
                    text: $noteBody,
                    font: .systemFont(ofSize: 15),
                    textColor: UIColor(Theme.Colors.textPrimary),
                    tintColor: UIColor(Theme.Colors.primary)
                )
                .frame(minHeight: 320)
                .padding(.horizontal, 12)
                .onChange(of: noteBody) { _, _ in scheduleSave() }
            }
        }
        .background(Theme.Colors.bgPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    PhotosPicker(selection: $pickerItems,
                                 maxSelectionCount: 5,
                                 matching: .any(of: [.images, .videos])) {
                        if uploading {
                            ProgressView().tint(Theme.Colors.primary)
                        } else {
                            Image(systemName: "paperclip")
                                .foregroundStyle(Theme.Colors.primary)
                        }
                    }
                    Button {
                        Task {
                            if let n = note {
                                await store.togglePin(id: n.id, pinned: !n.pinned)
                            }
                        }
                    } label: {
                        Image(systemName: (note?.pinned ?? false) ? "pin.fill" : "pin")
                            .foregroundStyle((note?.pinned ?? false) ? .orange : Theme.Colors.textSecondary)
                    }
                }
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    bodyFocused = false
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil, from: nil, for: nil)
                }
            }
        }
        .onAppear {
            loadIfNeeded()
            // Match ChatView — when a single note is open, hide the global
            // bottom tab bar so the editor gets the full screen.
            ChromeStore.shared.tabBarHidden = true
        }
        .onDisappear {
            flushSave()
            ChromeStore.shared.tabBarHidden = false
        }
        .onChange(of: pickerItems) { _, items in
            guard !items.isEmpty else { return }
            Task { await ingest(items) }
        }
        .fullScreenCover(item: $previewVideoURL) { wrap in
            InAppVideoPlayer(url: wrap.url)
        }
        .fullScreenCover(item: $previewImageData) { wrap in
            ImagePreview(data: wrap.data)
        }
        .alert("Attachment failed",
               isPresented: Binding(
                get: { uploadError != nil },
                set: { if !$0 { uploadError = nil } }
               )) {
            Button("OK", role: .cancel) { uploadError = nil }
        } message: {
            Text(uploadError ?? "")
        }
    }

    private func loadIfNeeded() {
        if loaded { return }
        guard let n = note, let dec = n.decrypted else { return }
        title = dec.title
        noteBody = htmlToText(dec.body)
        attachments = dec.attachments ?? []
        loaded = true
    }

    private func scheduleSave() {
        guard loaded else { return }
        saveTask?.cancel()
        let snapshot = NotePlaintext(title: title, body: textToHtml(noteBody),
                                     attachments: attachments.isEmpty ? nil : attachments)
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            if Task.isCancelled { return }
            await NotesStore.shared.updateNote(id: noteID, plain: snapshot)
        }
    }

    private func flushSave() {
        saveTask?.cancel()
        let snapshot = NotePlaintext(title: title, body: textToHtml(noteBody),
                                     attachments: attachments.isEmpty ? nil : attachments)
        Task { [noteID] in
            await NotesStore.shared.updateNote(id: noteID, plain: snapshot)
        }
    }

    private func ingest(_ items: [PhotosPickerItem]) async {
        uploading = true
        defer {
            uploading = false
            pickerItems = []
        }
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let ext = item.supportedContentTypes.first?.preferredFilenameExtension ?? "bin"
            let mime = item.supportedContentTypes.first?.preferredMIMEType ?? "application/octet-stream"
            let name = "attachment-\(Int(Date().timeIntervalSince1970)).\(ext)"
            do {
                let att = try await store.uploadAttachment(data: data, name: name, mime: mime, noteId: noteID)
                attachments.append(att)
                scheduleSave()
            } catch {
                print("[Notes] upload failed:", error)
            }
        }
    }

    private func removeAttachment(id: String) {
        attachments.removeAll { $0.id == id }
        scheduleSave()
    }

    private func htmlToText(_ html: String) -> String {
        var s = html
        s = s.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: .regularExpression)
        s = s.replacingOccurrences(of: "</p>", with: "\n", options: .regularExpression)
        s = s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "&nbsp;", with: " ")
        s = s.replacingOccurrences(of: "&amp;", with: "&")
        s = s.replacingOccurrences(of: "&lt;", with: "<")
        s = s.replacingOccurrences(of: "&gt;", with: ">")
        return s
    }

    private func textToHtml(_ text: String) -> String {
        let escaped = text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let lines = escaped.split(separator: "\n", omittingEmptySubsequences: false)
        return lines.map { "<p>\($0.isEmpty ? "<br>" : String($0))</p>" }.joined()
    }
}

// MARK: - Attachments grid + previews

private struct AttachmentsGrid: View {
    let attachments: [NoteAttachment]
    let store: NotesStore
    let onImageTap: (Data) -> Void
    let onVideoTap: (URL) -> Void
    let onRemove: (String) -> Void

    private let cols = [GridItem(.adaptive(minimum: 100), spacing: 8)]

    var body: some View {
        LazyVGrid(columns: cols, spacing: 8) {
            ForEach(attachments) { att in
                AttachmentTile(att: att, store: store,
                               onImageTap: onImageTap,
                               onVideoTap: onVideoTap,
                               onRemove: { onRemove(att.id) })
            }
        }
    }
}

private struct AttachmentTile: View {
    let att: NoteAttachment
    let store: NotesStore
    let onImageTap: (Data) -> Void
    let onVideoTap: (URL) -> Void
    let onRemove: () -> Void

    @State private var imageData: Data?
    @State private var videoURL: URL?
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if att.mime.hasPrefix("image/"), let d = imageData, let img = UIImage(data: d) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 100, height: 100)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .onTapGesture { onImageTap(d) }
                } else if att.mime.hasPrefix("video/"), let url = videoURL {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10).fill(Theme.Colors.bgTertiary)
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(.white)
                        Text(att.name)
                            .font(.cubbly(9))
                            .foregroundStyle(.white.opacity(0.8))
                            .lineLimit(1)
                            .padding(.horizontal, 6)
                            .frame(maxHeight: .infinity, alignment: .bottom)
                            .padding(.bottom, 4)
                    }
                    .frame(width: 100, height: 100)
                    .onTapGesture { onVideoTap(url) }
                } else {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10).fill(Theme.Colors.bgTertiary)
                        if loading {
                            ProgressView().tint(Theme.Colors.primary)
                        } else if failed {
                            VStack(spacing: 4) {
                                Image(systemName: "exclamationmark.triangle")
                                    .foregroundStyle(.orange)
                                Text(att.name)
                                    .font(.cubbly(9))
                                    .foregroundStyle(Theme.Colors.textMuted)
                                    .lineLimit(2)
                            }
                            .padding(4)
                        } else {
                            VStack(spacing: 4) {
                                Image(systemName: "doc.fill").foregroundStyle(Theme.Colors.textSecondary)
                                Text(att.name)
                                    .font(.cubbly(9))
                                    .foregroundStyle(Theme.Colors.textMuted)
                                    .lineLimit(2)
                            }
                            .padding(4)
                        }
                    }
                    .frame(width: 100, height: 100)
                }
            }

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(.white, .black.opacity(0.65))
            }
            .padding(4)
        }
        .task(id: att.id) { await load() }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let plain = try await store.downloadAttachment(att)
            if att.mime.hasPrefix("image/") {
                imageData = plain
            } else if att.mime.hasPrefix("video/") {
                let ext = att.name.split(separator: ".").last.map(String.init) ?? "mov"
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("note-\(att.id).\(ext)")
                try? plain.write(to: url)
                videoURL = url
            }
        } catch {
            failed = true
        }
    }
}

private struct ImagePreview: View {
    let data: Data
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let img = UIImage(data: data) {
                Image(uiImage: img).resizable().scaledToFit()
            }
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.down")
                            Text("Done")
                        }
                        .font(Theme.Fonts.bodyMedium)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                    }
                    Spacer()
                }
                .padding(.top, 50).padding(.horizontal, 16)
                Spacer()
            }
        }
    }
}

private struct IdentifiedData: Identifiable {
    let id: UUID
    let data: Data
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
