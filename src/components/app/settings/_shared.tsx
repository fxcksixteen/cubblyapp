import { CSSProperties, ReactNode } from "react";

/** Shared toggle used in every settings tab so they all look identical. */
export const SettingsToggle = ({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
    style={{ backgroundColor: checked ? "#3ba55c" : "#3f4147" }}
  >
    <span
      className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
      style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
    />
  </button>
);

/** Single labeled toggle row, used inside SettingsCard groups. */
export const SettingsToggleRow = ({
  title,
  description,
  checked,
  onChange,
  icon,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: ReactNode;
}) => (
  <div
    className="flex items-start justify-between gap-4 py-3.5 border-b last:border-b-0"
    style={{ borderColor: "var(--app-border)" }}
  >
    <div className="flex items-start gap-3 min-w-0 flex-1">
      {icon && <div className="shrink-0 mt-0.5" style={{ color: "var(--app-text-secondary)" }}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{title}</p>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>{description}</p>
        )}
      </div>
    </div>
    <SettingsToggle checked={checked} onChange={onChange} ariaLabel={title} />
  </div>
);

export const SettingsCard = ({
  children,
  cardStyle,
  className,
}: {
  children: ReactNode;
  cardStyle?: CSSProperties;
  className?: string;
}) => (
  <div
    className={`rounded-[24px] border p-5 ${className ?? ""}`}
    style={{
      backgroundColor: "var(--app-bg-tertiary)",
      borderColor: "var(--app-border)",
      ...cardStyle,
    }}
  >
    {children}
  </div>
);

export const SettingsSectionLabel = ({ children }: { children: ReactNode }) => (
  <p
    className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3"
    style={{ color: "var(--app-text-secondary)" }}
  >
    {children}
  </p>
);

/** Standardised primary button (Discord blurple) for any settings action. */
export const SettingsPrimaryButton = ({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className="rounded-full bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);
