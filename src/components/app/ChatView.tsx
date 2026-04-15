import { useState, useRef, useEffect } from "react";
import { useMessages, Message, MessageStatus } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { defaultProfileColor, getProfileColor } from "@/lib/profileColors";
import { CallPanel, CallEventMessage } from "./VoiceCallOverlay";
import TypingIndicator from "./TypingIndicator";
import sendIcon from "@/assets/icons/send.svg";
import folderFileIcon from "@/assets/icons/folder-file.svg";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

const preloadIcons = [sendIcon, folderFileIcon];
preloadIcons.forEach(src => { const img = new Image(); img.src = src; });

interface ChatViewProps {
  conversationId: string;
  recipientName: string;
  recipientAvatar?: string;
  recipientUserId?: string;
}

interface PendingFile {
  file: File;
  id: string;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return isToday ? `Today at ${time}` : `${d.toLocaleDateString()} ${time}`;
};

const formatDateDivider = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
};

const shouldShowTimeDivider = (prevDate: string, currDate: string): boolean => {
  const prev = new Date(prevDate).getTime();
  const curr = new Date(currDate).getTime();
  return curr - prev >= 2 * 60 * 60 * 1000;
};

const ChatView = ({ conversationId, recipientName, recipientUserId }: ChatViewProps) => {
  const { user } = useAuth();
  const { activeCall, callEvents } = useVoice();
  const { messages, loading, sendMessage } = useMessages(conversationId);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBotConversation = recipientUserId === BOT_USER_ID;

  // Filter call events for this conversation
  const conversationCallEvents = callEvents.filter(e => e.conversationId === conversationId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, conversationCallEvents, botTyping]);

  const handleSend = async () => {
    if (!input.trim() && pendingFiles.length === 0) return;
    setUploading(true);

    const attachmentUrls: { name: string; url: string; size: number; type: string }[] = [];
    for (const pf of pendingFiles) {
      const path = `${conversationId}/${Date.now()}-${pf.file.name}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, pf.file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);
        attachmentUrls.push({ name: pf.file.name, url: urlData.publicUrl, size: pf.file.size, type: pf.file.type });
      }
    }

    let content = input.trim();
    if (attachmentUrls.length > 0) {
      const attachmentMeta = JSON.stringify(attachmentUrls);
      content = content ? `${content}\n[attachments]${attachmentMeta}[/attachments]` : `[attachments]${attachmentMeta}[/attachments]`;
    }

    if (content) {
      // Show bot typing indicator for bot conversations
      if (isBotConversation) {
        setBotTyping(true);
      }
      await sendMessage(content);
    }

    setInput("");
    setPendingFiles([]);
    setAttachMenuOpen(false);
    setUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).map(f => ({ file: f, id: `file-${Date.now()}-${Math.random()}` }));
    setPendingFiles(prev => [...prev, ...newFiles]);
    setAttachMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id));
  };

  const parseContent = (content: string) => {
    const attachRegex = /\[attachments\](.*?)\[\/attachments\]/s;
    const match = content.match(attachRegex);
    const text = content.replace(attachRegex, "").trim();
    let attachments: { name: string; url: string; size: number; type: string }[] = [];
    if (match) {
      try { attachments = JSON.parse(match[1]); } catch {}
    }
    return { text, attachments };
  };

  const getAvatarColor = (senderId: string) => {
    if (senderId === user?.id) return defaultProfileColor.bg;
    return getProfileColor(senderId).bg;
  };

  // Build grouped messages with time dividers
  type ChatItem = 
    | { type: "messages"; sender_id: string; sender_name: string; messages: Message[]; timestamp: number }
    | { type: "divider"; label: string; timestamp: number }
    | { type: "call-event"; event: typeof conversationCallEvents[0]; timestamp: number };

  const items: ChatItem[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (i > 0 && shouldShowTimeDivider(messages[i - 1].created_at, msg.created_at)) {
      items.push({ type: "divider", label: formatDateDivider(msg.created_at), timestamp: new Date(msg.created_at).getTime() - 1 });
    }

    const last = items[items.length - 1];
    if (last && last.type === "messages" && last.sender_id === msg.sender_id) {
      last.messages.push(msg);
    } else {
      items.push({ type: "messages", sender_id: msg.sender_id, sender_name: msg.sender_name || "Unknown", messages: [msg], timestamp: new Date(msg.created_at).getTime() });
    }
  }

  // Interleave call events by timestamp
  for (const evt of conversationCallEvents) {
    const ts = new Date(evt.startedAt).getTime();
    let insertIdx = items.length;
    for (let i = 0; i < items.length; i++) {
      if (items[i].timestamp > ts) { insertIdx = i; break; }
    }
    items.splice(insertIdx, 0, { type: "call-event", event: evt, timestamp: ts });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Discord-style call panel */}
      <CallPanel
        conversationId={conversationId}
        recipientName={recipientName}
        recipientUserId={recipientUserId}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#5865f2] border-t-transparent" />
          </div>
        ) : messages.length === 0 && conversationCallEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="mb-3 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
              style={{ backgroundColor: recipientUserId ? getProfileColor(recipientUserId).bg : "#5865f2" }}
            >
              {recipientName.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-xl font-bold text-white">{recipientName}</h3>
            <p className="mt-1 text-sm text-[#949ba4]">
              This is the beginning of your direct message history with <strong className="text-white">{recipientName}</strong>.
            </p>
          </div>
        ) : (
          <>
            {items.map((item, idx) => {
              if (item.type === "divider") {
                return (
                  <div key={`divider-${idx}`} className="my-4 flex items-center gap-2">
                    <div className="flex-1 h-px bg-[#3f4147]" />
                    <span className="text-[11px] font-semibold text-[#949ba4] px-2 whitespace-nowrap">{item.label}</span>
                    <div className="flex-1 h-px bg-[#3f4147]" />
                  </div>
                );
              }

              if (item.type === "call-event") {
                return (
                  <CallEventMessage
                    key={item.event.id}
                    state={item.event.state}
                    startedAt={item.event.startedAt}
                    endedAt={item.event.endedAt}
                  />
                );
              }

              return (
                <div key={idx} className="mt-4 first:mt-0 flex gap-3 hover:bg-[#2e3035] rounded px-2 py-1">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: getAvatarColor(item.sender_id) }}
                  >
                    {item.sender_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-white text-sm">
                        {item.sender_id === user?.id ? "You" : item.sender_name}
                      </span>
                      <span className="text-[11px] text-[#949ba4]">{formatTime(item.messages[0].created_at)}</span>
                    </div>
                    {item.messages.map((msg) => {
                      const { text, attachments } = parseContent(msg.content);
                      return (
                        <div key={msg.id}>
                          {text && (
                            <p className={`text-sm leading-relaxed ${msg.status === "sending" ? "text-[#949ba4]/50" : "text-[#dbdee1]"}`}>
                              {text}
                            </p>
                          )}
                          {attachments.map((att, ai) => (
                            <a
                              key={ai}
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 flex items-center gap-2 rounded-lg border border-[#1e1f22] bg-[#2b2d31] p-3 max-w-sm hover:bg-[#32353b] transition-colors"
                            >
                              {att.type.startsWith("image/") ? (
                                <img src={att.url} alt={att.name} className="max-h-[200px] max-w-full rounded" />
                              ) : (
                                <>
                                  <img src={folderFileIcon} alt="" className="h-8 w-8 invert opacity-60 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-[#00a8fc] truncate">{att.name}</p>
                                    <p className="text-[11px] text-[#949ba4]">{formatFileSize(att.size)}</p>
                                  </div>
                                </>
                              )}
                            </a>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="border-t border-[#1e1f22] bg-[#2b2d31] px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((pf) => (
              <div key={pf.id} className="flex items-center gap-2 rounded-lg bg-[#383a40] px-3 py-2 text-sm">
                <img src={folderFileIcon} alt="" className="h-5 w-5 invert opacity-60 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[#dbdee1] text-xs font-medium truncate max-w-[150px]">{pf.file.name}</p>
                  <p className="text-[10px] text-[#949ba4]">{formatFileSize(pf.file.size)}</p>
                </div>
                <button onClick={() => removePendingFile(pf.id)} className="text-[#949ba4] hover:text-[#ed4245]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-lg bg-[#383a40] px-4 py-2.5 relative">
          <div className="relative">
            <button
              onClick={() => setAttachMenuOpen(!attachMenuOpen)}
              className="flex h-6 w-6 shrink-0 items-center justify-center text-[#b5bac1] hover:text-[#dbdee1] transition-transform"
              style={{ transform: attachMenuOpen ? "rotate(45deg)" : "rotate(0deg)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {attachMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-52 rounded-lg bg-[#111214] p-1.5 shadow-xl border border-[#1e1f22]">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white transition-colors"
                >
                  <img src={folderFileIcon} alt="" className="h-5 w-5 invert opacity-80" />
                  Upload a File
                </button>
              </div>
            )}
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={`Message @${recipientName}`}
            className="flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
          />

          <button
            onClick={handleSend}
            disabled={uploading || (!input.trim() && pendingFiles.length === 0)}
            className="text-[#b5bac1] hover:text-[#dbdee1] disabled:opacity-30 transition-opacity"
          >
            <img src={sendIcon} alt="Send" className="h-5 w-5 invert opacity-80" />
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      </div>
    </div>
  );
};

export default ChatView;
