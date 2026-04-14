import { useState, useRef, useEffect } from "react";
import { useMessages, Message } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, SmilePlus, Send } from "lucide-react";

interface ChatViewProps {
  conversationId: string;
  recipientName: string;
  recipientAvatar?: string;
}

const ChatView = ({ conversationId, recipientName }: ChatViewProps) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessages(conversationId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const msg = input;
    setInput("");
    await sendMessage(msg);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return isToday ? `Today at ${time}` : `${d.toLocaleDateString()} ${time}`;
  };

  // Group consecutive messages from same sender
  const grouped: { sender_id: string; sender_name: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const last = grouped[grouped.length - 1];
    if (last && last.sender_id === msg.sender_id) {
      last.messages.push(msg);
    } else {
      grouped.push({ sender_id: msg.sender_id, sender_name: msg.sender_name || "Unknown", messages: [msg] });
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#5865f2] border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#5865f2] text-2xl font-bold text-white">
              {recipientName.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-xl font-bold text-white">{recipientName}</h3>
            <p className="mt-1 text-sm text-[#949ba4]">
              This is the beginning of your direct message history with <strong className="text-white">{recipientName}</strong>.
            </p>
          </div>
        ) : (
          grouped.map((group, gi) => (
            <div key={gi} className="mt-4 first:mt-0 flex gap-3 hover:bg-[#2e3035] rounded px-2 py-1">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5865f2] text-sm font-bold text-white">
                {group.sender_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-white text-sm">
                    {group.sender_id === user?.id ? "You" : group.sender_name}
                  </span>
                  <span className="text-[11px] text-[#949ba4]">{formatTime(group.messages[0].created_at)}</span>
                </div>
                {group.messages.map((msg) => (
                  <p key={msg.id} className="text-sm text-[#dbdee1] leading-relaxed">{msg.content}</p>
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-lg bg-[#383a40] px-4 py-2.5">
          <Plus className="h-5 w-5 shrink-0 cursor-pointer text-[#b5bac1] hover:text-[#dbdee1]" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={`Message @${recipientName}`}
            className="flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
          />
          <SmilePlus className="h-5 w-5 shrink-0 cursor-pointer text-[#b5bac1] hover:text-[#dbdee1]" />
          <button onClick={handleSend} className="text-[#b5bac1] hover:text-[#dbdee1]">
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
