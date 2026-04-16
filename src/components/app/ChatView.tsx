import { useState, useRef, useEffect, useCallback } from "react";
import { useMessages, Message, MessageStatus } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { defaultProfileColor, getProfileColor } from "@/lib/profileColors";
import { CallPanel, CallEventMessage } from "./VoiceCallOverlay";
import TypingIndicator from "./TypingIndicator";
import MessageActions from "./chat/MessageActions";
import MessageContextMenu from "./chat/MessageContextMenu";
import UserProfileCard from "./chat/UserProfileCard";
import AttachmentItem from "./chat/AttachmentItem";
import InlineGif from "./chat/InlineGif";
import sendIcon from "@/assets/icons/send.svg";
import folderFileIcon from "@/assets/icons/folder-file.svg";
import gifIcon from "@/assets/icons/gif.svg";
import GifPicker from "./GifPicker";

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

const ChatView = ({ conversationId, recipientName, recipientAvatar, recipientUserId }: ChatViewProps) => {
  const { user } = useAuth();
  const { activeCall, callEvents } = useVoice();
  const { messages, loading, sendMessage } = useMessages(conversationId);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [profileCard, setProfileCard] = useState<{ userId: string; name: string; x: number; y: number } | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userHasScrolledUpRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcast = useRef(0);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingChannelReadyRef = useRef(false);

  const isBotConversation = recipientUserId === BOT_USER_ID;

  const lastMsgSenderId = messages.length > 0 ? messages[messages.length - 1].sender_id : null;
  useEffect(() => {
    if (lastMsgSenderId === BOT_USER_ID) {
      setBotTyping(false);
    }
  }, [lastMsgSenderId, messages.length]);

  const conversationCallEvents = callEvents.filter(e => e.conversationId === conversationId);

  // ---- Auto-scroll ----
  const scrollToBottom = useCallback(() => {
    // Double rAF ensures DOM has painted before we measure scrollHeight
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    });
  }, []);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 150;
    userHasScrolledUpRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight >= threshold;
  }, []);

  useEffect(() => {
    const n = messages.length;
    if (n > prevMessageCountRef.current) {
      const lastMsg = messages[n - 1];
      if (lastMsg?.sender_id === user?.id || !userHasScrolledUpRef.current) scrollToBottom();
    }
    prevMessageCountRef.current = n;
  }, [messages.length, messages, user?.id, scrollToBottom]);

  // Scroll to bottom on initial load and conversation switch + auto-focus input
  useEffect(() => {
    if (!loading && messages.length > 0) {
      // Reset scroll-up flag on conversation switch
      userHasScrolledUpRef.current = false;
      scrollToBottom();
      // Extra delayed scrolls for long conversations where DOM takes time to render
      const t1 = setTimeout(() => scrollToBottom(), 150);
      const t2 = setTimeout(() => scrollToBottom(), 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loading, conversationId, scrollToBottom]);

  // Auto-focus message input on conversation switch
  useEffect(() => {
    setTimeout(() => messageInputRef.current?.focus(), 50);
  }, [conversationId]);

  // Press Enter anywhere on the page to focus the message input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement !== messageInputRef.current &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        messageInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (botTyping && !userHasScrolledUpRef.current) scrollToBottom();
  }, [botTyping, scrollToBottom]);

  // ---- Realtime typing indicator ----
  useEffect(() => {
    if (!user || !conversationId) return;
    typingChannelReadyRef.current = false;
    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    typingChannelRef.current = channel;
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.userId === user.id) return;
        setPeerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000);
      })
      .on("broadcast", { event: "stop-typing" }, ({ payload }) => {
        if (payload.userId === user.id) return;
        setPeerTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      })
      .subscribe((status) => {
        typingChannelReadyRef.current = status === "SUBSCRIBED";
        // If user was already typing when channel became ready, broadcast immediately
        if (status === "SUBSCRIBED" && document.querySelector<HTMLTextAreaElement>('[data-typing-input]')?.value) {
          channel.send({ type: "broadcast", event: "typing", payload: { userId: user.id } });
        }
      });
    return () => {
      typingChannelReadyRef.current = false;
      typingChannelRef.current = null;
      supabase.removeChannel(channel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setPeerTyping(false);
    };
  }, [user, conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.sender_id !== user?.id) setPeerTyping(false);
    }
  }, [messages.length, messages, user?.id]);

  const broadcastTyping = useCallback(() => {
    if (!user || !conversationId) return;
    const now = Date.now();
    if (now - lastTypingBroadcast.current < 1500) return;
    lastTypingBroadcast.current = now;
    const ch = typingChannelRef.current;
    if (ch && typingChannelReadyRef.current) {
      ch.send({ type: "broadcast", event: "typing", payload: { userId: user.id } });
    }
  }, [user, conversationId]);

  const broadcastStopTyping = useCallback(() => {
    if (!user || !conversationId) return;
    const ch = typingChannelRef.current;
    if (ch && typingChannelReadyRef.current) {
      ch.send({ type: "broadcast", event: "stop-typing", payload: { userId: user.id } });
    }
  }, [user, conversationId]);

  const handleSend = async () => {
    if (!input.trim() && pendingFiles.length === 0) return;

    const currentInput = input.trim();
    const currentFiles = [...pendingFiles];

    setInput("");
    setPendingFiles([]);
    setAttachMenuOpen(false);
    broadcastStopTyping();

    setUploading(true);

    const attachmentUrls: { name: string; url: string; size: number; type: string }[] = [];
    for (const pf of currentFiles) {
      const path = `${conversationId}/${Date.now()}-${pf.file.name}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, pf.file);
      if (!error) {
        const { data: signedData } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 3600);
        if (signedData?.signedUrl) {
          attachmentUrls.push({ name: pf.file.name, url: signedData.signedUrl, size: pf.file.size, type: pf.file.type });
        }
      }
    }

    let content = currentInput;
    if (attachmentUrls.length > 0) {
      const attachmentMeta = JSON.stringify(attachmentUrls);
      content = content ? `${content}\n[attachments]${attachmentMeta}[/attachments]` : `[attachments]${attachmentMeta}[/attachments]`;
    }

    if (content) {
      if (isBotConversation) {
        setBotTyping(true);
      }
      // Reset scroll flag so auto-scroll works for own messages
      userHasScrolledUpRef.current = false;
      await sendMessage(content);
    }

    setUploading(false);
  };

  const handleGifSelect = async (gifUrl: string) => {
    if (isBotConversation) setBotTyping(true);
    userHasScrolledUpRef.current = false;
    await sendMessage(gifUrl);
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

  const handleAvatarClick = (e: React.MouseEvent, senderId: string, senderName: string) => {
    e.stopPropagation();
    setProfileCard({ userId: senderId, name: senderName, x: e.clientX, y: e.clientY });
  };

  // Build grouped messages with time dividers
  type ChatItem = 
    | { type: "messages"; sender_id: string; sender_name: string; sender_avatar_url?: string | null; messages: Message[]; timestamp: number }
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
      items.push({ type: "messages", sender_id: msg.sender_id, sender_name: msg.sender_name || "Unknown", sender_avatar_url: msg.sender_avatar_url, messages: [msg], timestamp: new Date(msg.created_at).getTime() });
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
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Discord-style call panel */}
      <div className="shrink-0 max-h-[50vh] overflow-y-auto">
        <CallPanel
          conversationId={conversationId}
          recipientName={recipientName}
          recipientAvatar={recipientAvatar}
          recipientUserId={recipientUserId}
        />
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ minHeight: 0 }}
      >
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
            <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
              This is the beginning of your direct message history with <strong className="text-white">{recipientName}</strong>.
            </p>
          </div>
        ) : (
          <>
            {items.map((item, idx) => {
              if (item.type === "divider") {
                return (
                  <div key={`divider-${idx}`} className="my-4 flex items-center gap-2">
                    <div className="flex-1 h-px" style={{ backgroundColor: "var(--app-border, #3f4147)" }} />
                    <span className="text-[11px] font-semibold px-2 whitespace-nowrap" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{item.label}</span>
                    <div className="flex-1 h-px" style={{ backgroundColor: "var(--app-border, #3f4147)" }} />
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
                <div key={idx} className="mt-4 first:mt-0 flex gap-3 rounded px-2 py-1 relative group" style={{ transition: "background-color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--app-hover, #2e3035)")} onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                  {item.sender_avatar_url ? (
                    <img
                      src={item.sender_avatar_url}
                      alt={item.sender_name}
                      className="h-10 w-10 shrink-0 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(e) => handleAvatarClick(e, item.sender_id, item.sender_name)}
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: getAvatarColor(item.sender_id) }}
                      onClick={(e) => handleAvatarClick(e, item.sender_id, item.sender_name)}
                    >
                      {item.sender_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-semibold text-white text-sm cursor-pointer hover:underline"
                        onClick={(e) => handleAvatarClick(e, item.sender_id, item.sender_name)}
                      >
                        {item.sender_name}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{formatTime(item.messages[0].created_at)}</span>
                    </div>
                    {item.messages.map((msg) => {
                      const { text, attachments } = parseContent(msg.content);
                      return (
                        <MessageContextMenu
                          key={msg.id}
                          messageId={msg.id}
                          messageContent={msg.content}
                          isOwnMessage={msg.sender_id === user?.id}
                        >
                          <div className="relative group/msg py-0.5">
                            {/* Hover action buttons for individual messages */}
                            <div className="absolute -top-3 right-0 flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-lg opacity-0 group-hover/msg:opacity-100 transition-opacity z-10"
                              style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)", borderColor: "var(--app-border, #2b2d31)" }}
                            >
                              <MessageActions
                                messageId={msg.id}
                                messageContent={msg.content}
                                isOwnMessage={msg.sender_id === user?.id}
                              />
                            </div>
                            {text && (
                              /^https?:\/\/.*\.(gif|giphy)/i.test(text) ? (
                                <InlineGif url={text} />
                              ) : (
                                <p className={`text-[15px] leading-relaxed ${msg.status === "sending" ? "opacity-50" : ""}`} style={{ color: "var(--app-text-primary, #dbdee1)" }}>
                                  {text}
                                </p>
                              )
                            )}
                            {attachments.map((att, ai) => (
                              <AttachmentItem key={ai} attachment={att} />
                            ))}
                          </div>
                        </MessageContextMenu>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
        <TypingIndicator
          typingUsers={[
            ...(botTyping ? [{ id: BOT_USER_ID, name: recipientName }] : []),
            ...(peerTyping && recipientUserId && recipientUserId !== BOT_USER_ID
              ? [{ id: recipientUserId, name: recipientName }]
              : []),
          ]}
        />
        <div ref={bottomRef} />
      </div>


      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="border-t px-4 py-2" style={{ borderColor: "var(--app-border, #1e1f22)", backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}>
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((pf) => (
              <div key={pf.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: "var(--app-input, #383a40)" }}>
                <img src={folderFileIcon} alt="" className="h-5 w-5 invert opacity-60 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate max-w-[150px]" style={{ color: "var(--app-text-primary, #dbdee1)" }}>{pf.file.name}</p>
                  <p className="text-[10px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{formatFileSize(pf.file.size)}</p>
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
        <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 relative" style={{ backgroundColor: "var(--app-input, #383a40)" }}>
          <div className="relative">
            <button
              onClick={() => setAttachMenuOpen(!attachMenuOpen)}
              className="flex h-5 w-5 shrink-0 items-center justify-center transition-transform"
              style={{ color: "var(--app-text-secondary, #b5bac1)", transform: attachMenuOpen ? "rotate(45deg)" : "rotate(0deg)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {attachMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-52 rounded-lg p-1.5 shadow-xl border" style={{ backgroundColor: "var(--app-bg-tertiary, #111214)", borderColor: "var(--app-border, #1e1f22)" }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-[#5865f2] hover:text-white transition-colors"
                  style={{ color: "var(--app-text-primary, #dbdee1)" }}
                >
                  <img src={folderFileIcon} alt="" className="h-5 w-5 invert opacity-80" />
                  Upload a File
                </button>
              </div>
            )}
          </div>

          <input
            ref={messageInputRef}
            type="text"
            value={input}
            onChange={(e) => {
              const v = e.target.value;
              setInput(v);
              if (v.trim()) broadcastTyping();
              else broadcastStopTyping();
            }}
            onBlur={broadcastStopTyping}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={`Message @${recipientName}`}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#6d6f78]"
            data-typing-input
            style={{ color: "var(--app-text-primary, #dbdee1)" }}
          />

          <div className="relative flex items-center">
            <button
              onClick={() => setGifPickerOpen(!gifPickerOpen)}
              className="flex items-center justify-center"
            >
              <img src={gifIcon} alt="GIF" className="h-5 w-5 invert opacity-60 hover:opacity-100 transition-opacity" />
            </button>
            <GifPicker
              isOpen={gifPickerOpen}
              onClose={() => setGifPickerOpen(false)}
              onSelect={handleGifSelect}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={uploading || (!input.trim() && pendingFiles.length === 0)}
            className="flex items-center justify-center disabled:opacity-30 transition-opacity"
          >
            <img src={sendIcon} alt="Send" className="h-5 w-5 invert opacity-80" />
          </button>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Profile Card Popup */}
      {profileCard && (
        <UserProfileCard
          userId={profileCard.userId}
          displayName={profileCard.name}
          position={{ x: profileCard.x, y: profileCard.y }}
          onClose={() => setProfileCard(null)}
        />
      )}
    </div>
  );
};

export default ChatView;
