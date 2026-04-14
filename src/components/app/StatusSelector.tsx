import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const statuses = [
  { value: "online", label: "Online", color: "bg-[#3ba55c]" },
  { value: "idle", label: "Idle", color: "bg-[#faa61a]" },
  { value: "dnd", label: "Do Not Disturb", color: "bg-[#ed4245]" },
  { value: "invisible", label: "Invisible", color: "bg-[#747f8d]" },
] as const;

interface StatusSelectorProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
}

const StatusSelector = ({ currentStatus, onStatusChange }: StatusSelectorProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = async (status: string) => {
    setOpen(false);
    onStatusChange(status);
    if (user) {
      await supabase.from("profiles").update({ status }).eq("user_id", user.id);
    }
  };

  const current = statuses.find(s => s.value === currentStatus) || statuses[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-sm hover:bg-[#35373c] transition-colors text-[#dbdee1]"
      >
        <div className={`h-2.5 w-2.5 rounded-full ${current.color}`} />
        <span>{current.label}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-52 rounded-lg bg-[#111214] p-1.5 shadow-xl border border-[#2b2d31] z-50">
          <p className="px-2 py-1 text-[11px] font-bold uppercase text-[#949ba4]">Set Status</p>
          {statuses.map((s) => (
            <button
              key={s.value}
              onClick={() => handleSelect(s.value)}
              className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors ${
                currentStatus === s.value ? "bg-[#404249] text-white" : "text-[#dbdee1] hover:bg-[#35373c]"
              }`}
            >
              <div className={`h-3 w-3 rounded-full ${s.color}`} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StatusSelector;
