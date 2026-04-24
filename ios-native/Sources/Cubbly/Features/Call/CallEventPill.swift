import SwiftUI
import Supabase

/// Discord-style "📞 Call started" / "Ongoing call — Join" pill rendered inline
/// inside chat threads. Mirrors the desktop `CallEventBubble` semantics:
///   - state=ongoing → green "Join Call" CTA
///   - state=ended   → gray "Call ended · Xm Ys"
///   - state=missed  → red "Missed call"
struct CallEventPill: View {
    struct Event {
        let id: UUID
        let state: String       // "ongoing" | "ended" | "missed"
        let startedAt: Date
        let endedAt: Date?
    }

    let conversationId: UUID
    let event: Event
    let onJoin: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(color.opacity(0.15)).frame(width: 36, height: 36)
                Image(systemName: icon)
                    .foregroundStyle(color)
                    .font(.system(size: 16, weight: .semibold))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.cubbly(13, .semibold)).foregroundStyle(.white)
                Text(subLabel).font(.cubbly(11, .regular)).foregroundStyle(Theme.Colors.textSecondary)
            }
            Spacer()
            if event.state == "ongoing" {
                Button(action: onJoin) {
                    Text("Join")
                        .font(.cubbly(12, .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(Capsule().fill(Color.green))
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.Colors.bgSecondary))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.Colors.border, lineWidth: 1))
    }

    private var color: Color {
        switch event.state {
        case "ongoing": return .green
        case "missed": return .red
        default: return Theme.Colors.textSecondary
        }
    }

    private var icon: String {
        switch event.state {
        case "ongoing": return "phone.fill"
        case "missed":  return "phone.down.fill"
        default:        return "phone.fill"
        }
    }

    private var label: String {
        switch event.state {
        case "ongoing": return "Ongoing call"
        case "missed":  return "Missed call"
        default:        return "Call ended"
        }
    }

    private var subLabel: String {
        if event.state == "ongoing" {
            let mins = Int(Date().timeIntervalSince(event.startedAt) / 60)
            return mins <= 0 ? "Just started" : "Started \(mins)m ago"
        } else if let end = event.endedAt {
            let dur = Int(end.timeIntervalSince(event.startedAt))
            return "\(dur / 60)m \(dur % 60)s"
        }
        return ""
    }
}
