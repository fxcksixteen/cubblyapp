import Foundation

/// Discord-style compact relative time: "now", "5m", "2h", "3d", "Mar 4".
enum RelativeTime {
    static func compact(from date: Date, now: Date = Date()) -> String {
        let secs = Int(now.timeIntervalSince(date))
        if secs < 60 { return "now" }
        let mins = secs / 60
        if mins < 60 { return "\(mins)m" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h" }
        let days = hours / 24
        if days < 7 { return "\(days)d" }
        let f = DateFormatter()
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }
}
