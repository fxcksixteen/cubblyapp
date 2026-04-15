import { useEffect, useState } from "react";
import { getProfileColor } from "@/lib/profileColors";

interface TypingIndicatorProps {
  typingUsers: { id: string; name: string }[];
}

const TypingIndicator = ({ typingUsers }: TypingIndicatorProps) => {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map(u => u.name);
  const text =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : `${names[0]} and ${names.length - 1} others are typing`;

  const firstColor = getProfileColor(typingUsers[0].id);

  return (
    <div className="flex items-center gap-2 px-4 h-6 min-h-[24px] transition-all duration-200">
      <div className="flex items-center gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-[6px] w-[6px] rounded-full"
            style={{
              backgroundColor: firstColor.bg,
              animation: `typing-bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
            }}
          />
        ))}
      </div>
      <span className="text-xs font-medium" style={{ color: "var(--app-text-secondary)" }}>
        {text}
      </span>
    </div>
  );
};

export default TypingIndicator;
