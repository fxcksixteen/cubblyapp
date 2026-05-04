import { CSSProperties } from "react";
import { useLocalSetting } from "@/hooks/useLocalSetting";

interface Props {
  cardStyle: CSSProperties;
}

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!checked)}
    className="relative h-6 w-11 rounded-full transition-colors"
    style={{ backgroundColor: checked ? "#3ba55c" : "var(--app-bg-tertiary)" }}
  >
    <span
      className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
      style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
    />
  </button>
);

const Row = ({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
    <div className="min-w-0">
      <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{title}</p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>{description}</p>
    </div>
    <Toggle checked={checked} onChange={onChange} />
  </div>
);

export default function AccessibilitySettings({ cardStyle }: Props) {
  const [reducedMotion, setReducedMotion] = useLocalSetting("cubbly:a11y:reducedMotion", false);
  const [highContrast, setHighContrast] = useLocalSetting("cubbly:a11y:highContrast", false);
  const [largerText, setLargerText] = useLocalSetting("cubbly:a11y:largerText", false);
  const [underlineLinks, setUnderlineLinks] = useLocalSetting("cubbly:a11y:underlineLinks", false);
  const [reducedTransparency, setReducedTransparency] = useLocalSetting("cubbly:a11y:reducedTransparency", false);
  const [keyboardOutlines, setKeyboardOutlines] = useLocalSetting("cubbly:a11y:keyboardOutlines", true);
  const [screenReader, setScreenReader] = useLocalSetting("cubbly:a11y:screenReader", false);
  const [zoom, setZoom] = useLocalSetting<number>("cubbly:a11y:zoom", 100);

  // Apply globally to <html> element
  if (typeof document !== "undefined") {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    document.documentElement.dataset.highContrast = String(highContrast);
    document.documentElement.dataset.largerText = String(largerText);
    document.documentElement.dataset.underlineLinks = String(underlineLinks);
    document.documentElement.dataset.reducedTransparency = String(reducedTransparency);
    document.documentElement.dataset.keyboardOutlines = String(keyboardOutlines);
    document.documentElement.style.setProperty("--app-zoom", String(zoom / 100));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Accessibility</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>Make Cubbly easier to read, navigate, and use.</p>
      </div>

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "var(--app-text-secondary)" }}>Visual</p>
        <Row title="Reduced motion" description="Minimise animations and transitions across the app." checked={reducedMotion} onChange={setReducedMotion} />
        <Row title="High contrast" description="Boost contrast on text, borders, and buttons." checked={highContrast} onChange={setHighContrast} />
        <Row title="Larger text" description="Bumps base text size up by ~12%." checked={largerText} onChange={setLargerText} />
        <Row title="Always underline links" description="Show underlines on hyperlinks at all times." checked={underlineLinks} onChange={setUnderlineLinks} />
        <Row title="Reduce transparency" description="Replace blurred glass surfaces with solid backgrounds." checked={reducedTransparency} onChange={setReducedTransparency} />
      </div>

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: "var(--app-text-secondary)" }}>Zoom</p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={75}
            max={150}
            step={5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#5865f2]"
          />
          <span className="text-sm font-semibold w-14 text-right" style={{ color: "var(--app-text-primary)" }}>{zoom}%</span>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--app-text-secondary)" }}>Scales the entire app interface. Affects text, icons, and spacing.</p>
      </div>

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "var(--app-text-secondary)" }}>Navigation</p>
        <Row title="Keyboard focus outlines" description="Show a visible outline when navigating with Tab." checked={keyboardOutlines} onChange={setKeyboardOutlines} />
        <Row title="Screen reader optimisations" description="Adds extra ARIA labels and skip links." checked={screenReader} onChange={setScreenReader} />
      </div>
    </div>
  );
}
