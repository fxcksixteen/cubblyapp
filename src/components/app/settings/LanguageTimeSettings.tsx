import { useLocalSetting } from "@/hooks/useLocalSetting";
import { Globe, Clock } from "lucide-react";

interface LanguageTimeSettingsProps {
  cardStyle: React.CSSProperties;
}

const LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "it-IT", label: "Italiano" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "pl-PL", label: "Polski" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "ru-RU", label: "Русский" },
  { code: "uk-UA", label: "Українська" },
  { code: "ar-SA", label: "العربية" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "hi-IN", label: "हिन्दी" },
];

const LanguageTimeSettings = ({ cardStyle }: LanguageTimeSettingsProps) => {
  const [language, setLanguage] = useLocalSetting<string>("locale.language", "en-US");
  const [timeFormat, setTimeFormat] = useLocalSetting<"12h" | "24h">("locale.timeFormat", "12h");
  const [dateFormat, setDateFormat] = useLocalSetting<"MDY" | "DMY" | "YMD">("locale.dateFormat", "MDY");
  const [timezone, setTimezone] = useLocalSetting<string>("locale.timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [firstDayOfWeek, setFirstDayOfWeek] = useLocalSetting<"sun" | "mon">("locale.firstDay", "sun");

  const sample = new Date();
  const sampleTime = sample.toLocaleTimeString(language, {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12h",
    timeZone: timezone,
  });
  const sampleDate = (() => {
    const d = sample.getDate();
    const m = sample.getMonth() + 1;
    const y = sample.getFullYear();
    if (dateFormat === "DMY") return `${d}/${m}/${y}`;
    if (dateFormat === "YMD") return `${y}/${m}/${d}`;
    return `${m}/${d}/${y}`;
  })();

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <div className="flex items-start gap-3">
          <Globe className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Language</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>
              Some translations are still in progress. English is the fallback.
            </p>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} style={{ backgroundColor: "var(--app-bg-secondary)" }}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Time format</p>
              <div className="mt-2 flex gap-2">
                {(["12h", "24h"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setTimeFormat(opt)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                    style={{
                      backgroundColor: timeFormat === opt ? "var(--app-active)" : "var(--app-bg-tertiary)",
                      color: timeFormat === opt ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                    }}
                  >
                    {opt === "12h" ? "12-hour (1:30 PM)" : "24-hour (13:30)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Date format</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {([
                  { id: "MDY", label: "Month / Day / Year" },
                  { id: "DMY", label: "Day / Month / Year" },
                  { id: "YMD", label: "Year / Month / Day" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setDateFormat(opt.id)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: dateFormat === opt.id ? "var(--app-active)" : "var(--app-bg-tertiary)",
                      color: dateFormat === opt.id ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>First day of week</p>
              <div className="mt-2 flex gap-2">
                {(["sun", "mon"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFirstDayOfWeek(opt)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                    style={{
                      backgroundColor: firstDayOfWeek === opt ? "var(--app-active)" : "var(--app-bg-tertiary)",
                      color: firstDayOfWeek === opt ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                    }}
                  >
                    {opt === "sun" ? "Sunday" : "Monday"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Timezone</p>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
                placeholder="e.g. America/New_York"
              />
              <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                IANA timezone name. Defaults to your system timezone.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>Preview</p>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-primary)" }}>
          {sampleDate} • {sampleTime}
        </p>
      </div>
    </div>
  );
};

export default LanguageTimeSettings;
