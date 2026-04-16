import { useState } from "react";
import { CHANGELOG } from "@/lib/changelog";
import WhatsNewModal from "@/components/app/WhatsNewModal";
import { ChevronRight } from "lucide-react";

interface UpdateLogsSettingsProps {
  cardStyle: React.CSSProperties;
}

/**
 * Update Logs — a list of every patch's changelog. Clicking a row re-opens
 * the same `WhatsNewModal` in viewer mode (doesn't write the seen-flag).
 * Styled to match the rest of the settings tabs.
 */
const UpdateLogsSettings = ({ cardStyle }: UpdateLogsSettingsProps) => {
  const [openVersion, setOpenVersion] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border overflow-hidden" style={cardStyle}>
        {CHANGELOG.map((entry, i) => (
          <button
            key={entry.version}
            onClick={() => setOpenVersion(entry.version)}
            className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5"
            style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-border)" }}
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(32 80% 55%), hsl(20 75% 50%))" }}
            >
              v{entry.version}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                {entry.title || `Cubbly v${entry.version}`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>
                {new Date(entry.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                {" · "}
                {entry.newFeatures.length} new · {entry.bugFixes.length} fixes
              </p>
            </div>
            <ChevronRight className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
        ))}
      </div>

      {openVersion && (
        <WhatsNewModal forceVersion={openVersion} onClose={() => setOpenVersion(null)} />
      )}
    </div>
  );
};

export default UpdateLogsSettings;
