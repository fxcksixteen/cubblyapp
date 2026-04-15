import statusIdleIcon from "@/assets/icons/status-idle.svg";
import statusDndIcon from "@/assets/icons/status-dnd.svg";
import statusInvisibleIcon from "@/assets/icons/status-invisible.svg";

interface StatusIndicatorProps {
  status: string;
  size?: "sm" | "md" | "lg";
  borderColor?: string;
  className?: string;
}

const sizeMap = {
  sm: { container: "h-3 w-3", icon: "h-2 w-2", border: "border-[2.5px]" },
  md: { container: "h-3.5 w-3.5", icon: "h-2.5 w-2.5", border: "border-[3px]" },
  lg: { container: "h-5 w-5", icon: "h-3 w-3", border: "border-[3px]" },
};

const statusIconMap: Record<string, string> = {
  idle: statusIdleIcon,
  dnd: statusDndIcon,
  invisible: statusInvisibleIcon,
  offline: statusInvisibleIcon,
};

const statusFilterMap: Record<string, string> = {
  idle: "brightness(0) saturate(100%) invert(72%) sepia(58%) saturate(1000%) hue-rotate(357deg) brightness(101%) contrast(96%)",
  dnd: "brightness(0) saturate(100%) invert(36%) sepia(71%) saturate(5500%) hue-rotate(345deg) brightness(94%) contrast(92%)",
  invisible: "brightness(0) saturate(100%) invert(55%) sepia(7%) saturate(500%) hue-rotate(182deg) brightness(92%) contrast(87%)",
  offline: "brightness(0) saturate(100%) invert(55%) sepia(7%) saturate(500%) hue-rotate(182deg) brightness(92%) contrast(87%)",
};

const StatusIndicator = ({ status, size = "sm", borderColor = "#313338", className = "" }: StatusIndicatorProps) => {
  const s = sizeMap[size];
  const icon = statusIconMap[status];

  if (status === "online") {
    return (
      <div
        className={`${s.container} rounded-full ${s.border} bg-[#3ba55c] ${className}`}
        style={{ borderColor }}
      />
    );
  }

  if (icon) {
    return (
      <div
        className={`${s.container} rounded-full ${s.border} flex items-center justify-center bg-[#313338] ${className}`}
        style={{ borderColor, backgroundColor: borderColor }}
      >
        <img
          src={icon}
          alt={status}
          className={s.icon}
          style={{ filter: statusFilterMap[status] }}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div
      className={`${s.container} rounded-full ${s.border} bg-[#747f8d] ${className}`}
      style={{ borderColor }}
    />
  );
};

export default StatusIndicator;
