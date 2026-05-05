import { CSSProperties } from "react";
import { useLocalSetting } from "@/hooks/useLocalSetting";
import { SettingsCard, SettingsToggleRow, SettingsSectionLabel } from "./_shared";

interface Props {
  cardStyle: CSSProperties;
}

export default function AccessibilitySettings({ cardStyle }: Props) {
  const [reducedMotion, setReducedMotion] = useLocalSetting("cubbly:a11y:reducedMotion", false);
  const [highContrast, setHighContrast] = useLocalSetting("cubbly:a11y:highContrast", false);
  const [largerText, setLargerText] = useLocalSetting("cubbly:a11y:largerText", false);
  const [underlineLinks, setUnderlineLinks] = useLocalSetting("cubbly:a11y:underlineLinks", false);
  const [reducedTransparency, setReducedTransparency] = useLocalSetting("cubbly:a11y:reducedTransparency", false);
  const [keyboardOutlines, setKeyboardOutlines] = useLocalSetting("cubbly:a11y:keyboardOutlines", true);
  const [screenReader, setScreenReader] = useLocalSetting("cubbly:a11y:screenReader", false);
  const [zoom, setZoom] = useLocalSetting<number>("cubbly:a11y:zoom", 100);

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
    <div className="space-y-5">
      <SettingsCard cardStyle={cardStyle}>
        <SettingsSectionLabel>Visual</SettingsSectionLabel>
        <SettingsToggleRow title="Reduced motion" description="Minimise animations and transitions across the app." checked={reducedMotion} onChange={setReducedMotion} />
        <SettingsToggleRow title="High contrast" description="Boost contrast on text, borders, and buttons." checked={highContrast} onChange={setHighContrast} />
        <SettingsToggleRow title="Larger text" description="Bumps base text size up by ~12%." checked={largerText} onChange={setLargerText} />
        <SettingsToggleRow title="Always underline links" description="Show underlines on hyperlinks at all times." checked={underlineLinks} onChange={setUnderlineLinks} />
        <SettingsToggleRow title="Reduce transparency" description="Replace blurred glass surfaces with solid backgrounds." checked={reducedTransparency} onChange={setReducedTransparency} />
      </SettingsCard>

      <SettingsCard cardStyle={cardStyle}>
        <SettingsSectionLabel>Zoom</SettingsSectionLabel>
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
      </SettingsCard>

      <SettingsCard cardStyle={cardStyle}>
        <SettingsSectionLabel>Navigation</SettingsSectionLabel>
        <SettingsToggleRow title="Keyboard focus outlines" description="Show a visible outline when navigating with Tab." checked={keyboardOutlines} onChange={setKeyboardOutlines} />
        <SettingsToggleRow title="Screen reader optimisations" description="Adds extra ARIA labels and skip links." checked={screenReader} onChange={setScreenReader} />
      </SettingsCard>
    </div>
  );
}
