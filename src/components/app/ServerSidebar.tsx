import { Plus } from "lucide-react";
import cubblyWordmark from "@/assets/cubbly-wordmark-white.png";
import cubblyLogo from "@/assets/cubbly-logo.png";

interface ServerSidebarProps {
  onHomeClick: () => void;
}

const ServerSidebar = ({ onHomeClick }: ServerSidebarProps) => {
  return (
    <div className="flex w-[72px] flex-shrink-0 flex-col items-center gap-2 py-3 sidebar-tertiary" style={{ backgroundColor: 'var(--app-bg-tertiary)' }}>
      {/* Cubbly wordmark */}
      <div className="mb-1">
        <img src={cubblyWordmark} alt="Cubbly" className="h-7 w-auto" />
      </div>

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      {/* Home / DM button with Cubbly logo */}
      <button
        onClick={onHomeClick}
        className="group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] transition-all duration-200 hover:rounded-[16px] hover:bg-[#5865f2] overflow-hidden"
      >
        <img src={cubblyLogo} alt="Home" className="h-8 w-8 object-contain" />
        <div className="absolute left-0 h-0 w-1 rounded-r-full bg-white transition-all group-hover:h-5" />
      </button>

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      {/* Add server */}
      <button className="group flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#3ba55c] transition-all hover:rounded-[16px] hover:bg-[#3ba55c] hover:text-white">
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
};

export default ServerSidebar;
