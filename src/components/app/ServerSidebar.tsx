import { Plus } from "lucide-react";
import cubblyWordmark from "@/assets/cubbly-wordmark-white.png";
import cubblyLogo from "@/assets/cubbly-logo.png";

interface ServerSidebarProps {
  isActive?: boolean;
  onHomeClick: () => void;
}

const ServerSidebar = ({ onHomeClick, isActive = false }: ServerSidebarProps) => {
  return (
    <div className="flex w-[84px] flex-shrink-0 flex-col items-center gap-3 py-4 sidebar-tertiary" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
      <div className="mb-1">
        <img src={cubblyWordmark} alt="Cubbly" className="h-8 w-auto" />
      </div>

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      <button
        onClick={() => {
          if (!isActive) onHomeClick();
        }}
        className="group relative flex h-14 w-14 items-center justify-center overflow-visible transition-all duration-200 hover:scale-[1.03]"
        aria-current={isActive ? "page" : undefined}
      >
        <div className={`absolute -left-4 w-1 rounded-r-full bg-white transition-all duration-200 ${isActive ? "h-8 opacity-100" : "h-0 opacity-0 group-hover:h-6 group-hover:opacity-100"}`} />
        <img
          src={cubblyLogo}
          alt="Home"
          className={`h-14 w-14 object-cover shadow-[0_10px_20px_rgba(0,0,0,0.24)] cubbly-3d-circle transition-all duration-200 ${
            isActive ? "rounded-[16px]" : "rounded-full group-hover:rounded-[20px]"
          }`}
        />
      </button>

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      <button
        className={`group relative flex h-14 w-14 items-center justify-center text-[#3ba55c] transition-all duration-200 hover:bg-[#3ba55c] hover:text-white cubbly-3d-circle ${
          false ? "rounded-[16px]" : "rounded-full hover:rounded-[20px]"
        }`}
        style={{ backgroundColor: "var(--app-bg-primary)" }}
      >
        <div className="absolute -left-4 w-1 rounded-r-full bg-white transition-all duration-200 h-0 opacity-0 group-hover:h-6 group-hover:opacity-100" />
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
};

export default ServerSidebar;
