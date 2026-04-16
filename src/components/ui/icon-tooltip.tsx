import { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconTooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  shortcut?: string;
}

/**
 * Cubbly-styled tooltip used on icon-only buttons.
 * Soft dark surface, slight shadow, subtle entrance.
 */
const IconTooltip = ({ label, children, side = "top", shortcut }: IconTooltipProps) => {
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={8}
        className="rounded-lg border-0 px-3 py-1.5 text-xs font-semibold shadow-2xl"
        style={{
          backgroundColor: "#0d0d0f",
          color: "#ffffff",
        }}
      >
        <div className="flex items-center gap-2">
          <span>{label}</span>
          {shortcut && (
            <kbd
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: "#26272b", color: "#b5bac1" }}
            >
              {shortcut}
            </kbd>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default IconTooltip;
