import SwiftUI

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

            PinDots(value: step == 1 ? pin : confirmPin)
                .offset(x: shake ? -10 : 0)
                .animation(.default.repeatCount(3, autoreverses: true).speed(6), value: shake)

            // Hidden numeric pad
            TextField("", text: step == 1 ? $pin : $confirmPin)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .frame(width: 1, height: 1)
                .opacity(0.02)
                .onChange(of: pin) { _, v in onPinChange(v, isConfirm: false) }
                .onChange(of: confirmPin) { _, v in onPinChange(v, isConfirm: true) }

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
    }

    private func onPinChange(_ v: String, isConfirm: Bool) {
        // Sanitize to 4 digits.
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
        if setup {
            step = 2
            return
        }
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
        do {
            try await store.setupVault(pin: v, trust: trust)
        } catch {
            errorText = "Couldn't create vault"
        }
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
        NavigationStack {
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
                    NavigationLink(value: note.id) {
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
            .navigationDestination(for: UUID.self) { id in
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
            }
            Text(plainPreview(note.decrypted?.body ?? "") )
                .font(.cubbly(12))
                .foregroundStyle(Theme.Colors.textSecondary)
                .lineLimit(2)
        }
        .padding(.vertical, 4)
    }

    private func plainPreview(_ html: String) -> String {
        // Cheap HTML strip so web-formatted notes preview cleanly on iOS.
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

private struct NoteEditorView: View {
    @ObservedObject var store: NotesStore
    let noteID: UUID
    @State private var title: String = ""
    @State private var noteBody: String = ""
    @State private var loaded = false
    @State private var saveTask: Task<Void, Never>?
    @FocusState private var bodyFocused: Bool

    private var note: NoteRow? { store.notes.first(where: { $0.id == noteID }) }

    var body: some View {
        VStack(spacing: 0) {
            TextField("Title", text: $title)
                .font(.cubbly(22, .bold))
                .foregroundStyle(Theme.Colors.textPrimary)
                .padding(.horizontal, 16).padding(.top, 12)
                .onChange(of: title) { _, _ in scheduleSave() }
            Divider().padding(.vertical, 8)
            TextEditor(text: $body)
                .font(.cubbly(15))
                .foregroundStyle(Theme.Colors.textPrimary)
                .scrollContentBackground(.hidden)
                .background(Theme.Colors.bgPrimary)
                .padding(.horizontal, 12)
                .focused($bodyFocused)
                .onChange(of: body) { _, _ in scheduleSave() }
        }
        .background(Theme.Colors.bgPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
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
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { bodyFocused = false }
            }
        }
        .onAppear { loadIfNeeded() }
        .onDisappear { flushSave() }
    }

    private func loadIfNeeded() {
        if loaded { return }
        guard let n = note, let dec = n.decrypted else { return }
        title = dec.title
        body = htmlToText(dec.body)
        loaded = true
    }

    private func scheduleSave() {
        guard loaded else { return }
        saveTask?.cancel()
        saveTask = Task { [title, body] in
            try? await Task.sleep(nanoseconds: 700_000_000)
            if Task.isCancelled { return }
            await NotesStore.shared.updateNote(id: noteID, plain: NotePlaintext(
                title: title, body: textToHtml(body)
            ))
        }
    }

    private func flushSave() {
        saveTask?.cancel()
        Task { [title, body, noteID] in
            await NotesStore.shared.updateNote(id: noteID, plain: NotePlaintext(
                title: title, body: textToHtml(body)
            ))
        }
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
        // Wrap each line in <p> so web renders it the same way.
        let escaped = text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let lines = escaped.split(separator: "\n", omittingEmptySubsequences: false)
        return lines.map { "<p>\($0.isEmpty ? "<br>" : String($0))</p>" }.joined()
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
