import { getProfileColor } from "@/lib/profileColors";

interface TypingUser {
  id: string;
  name: string;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

const formatNames = (users: TypingUser[]): string => {
  const names = users.map((u) => u.name);
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing`;
  // 4+ — don't list everyone
  return `Several people are typing`;
};

const TypingIndicator = ({ typingUsers }: TypingIndicatorProps) => {
  if (typingUsers.length === 0) return null;

  const text = formatNames(typingUsers);
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
