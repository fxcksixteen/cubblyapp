import { useState, useRef, useEffect, useCallback } from "react";
import { useMessages, Message, MessageStatus } from "@/hooks/useMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { supabase } from "@/integrations/supabase/client";
import { X, Reply as ReplyIcon } from "lucide-react";
import { defaultProfileColor, getProfileColor } from "@/lib/profileColors";
import { CallPanel, CallEventMessage } from "./VoiceCallOverlay";
import GroupCallPanel from "./GroupCallPanel";
import TypingIndicator from "./TypingIndicator";
import MessageActions from "./chat/MessageActions";
import MessageContextMenu from "./chat/MessageContextMenu";
import UserProfileCard from "./chat/UserProfileCard";
import { useTypeToFocus } from "@/hooks/useTypeToFocus";
import { useAutoGrowTextarea } from "@/hooks/useAutoGrowTextarea";
import AttachmentItem from "./chat/AttachmentItem";
import InlineGif from "./chat/InlineGif";
import LinkPreview from "./chat/LinkPreview";
import GroupMembersPanel from "./GroupMembersPanel";
import { linkifyText, extractFirstUrl } from "@/lib/linkify";
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
  /** Optional: if present and is_group, the group members panel is rendered. */
  conversation?: import("@/hooks/useConversations").Conversation;
  /** Whether the group members side panel should be visible (controlled by parent). */
  showGroupMembers?: boolean;
  onLeftGroup?: () => void;
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

const ChatView = ({ conversationId, recipientName, recipientAvatar, recipientUserId, conversation, showGroupMembers, onLeftGroup }: ChatViewProps) => {
  const { user } = useAuth();
  const { activeCall, callEvents, startCall } = useVoice();
  const { messages, loading, sendMessage, loadOlder, hasMore, loadingOlder } = useMessages(conversationId);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [profileCard, setProfileCard] = useState<{ userId: string; name: string; x: number; y: number } | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; sender_name: string; content: string } | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  /** First unread message id captured ON ENTRY. Stays until reply or chat re-entry. Drives the red "NEW" divider. */
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  /** Count of unread on entry — drives the blue "New Messages" top bar. Cleared by scrolling to bottom OR clicking dismiss. */
  const [unreadOnEntry, setUnreadOnEntry] = useState<number>(0);
  const [showNewBar, setShowNewBar] = useState(false);
  const [rejoiningEventId, setRejoiningEventId] = useState<string | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userHasScrolledUpRef = useRef(false);
  const prevMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcast = useRef(0);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingChannelReadyRef = useRef(false);
  const initialUnreadCapturedRef = useRef(false);

  useAutoGrowTextarea(messageInputRef, input, 6);

  const isBotConversation = recipientUserId === BOT_USER_ID;

  const lastMsgSenderId = messages.length > 0 ? messages[messages.length - 1].sender_id : null;
  useEffect(() => {
    if (lastMsgSenderId === BOT_USER_ID) {
      setBotTyping(false);
    }
  }, [lastMsgSenderId, messages.length]);

  // Filter call events for THIS conversation, but enforce the invariant that
  // there can only ever be ONE "ongoing" pill at a time per chat (multiple
  // would be a stale-data bug — only one call can actually be live in a chat).
  // We keep the most recent ongoing one and demote any older "ongoing"
  // duplicates to "ended" visually so the chat history is coherent.
  const conversationCallEvents = (() => {
    const all = callEvents.filter(e => e.conversationId === conversationId);
    const ongoingByStart = all
      .filter(e => e.state === "ongoing")
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    const keepOngoingId = ongoingByStart[0]?.id;
    return all.map(e => {
      if (e.state === "ongoing" && e.id !== keepOngoingId) {
        // Stale duplicate — render as ended
        return { ...e, state: "ended" as const, endedAt: e.endedAt || new Date().toISOString() };
      }
      return e;
    });
  })();

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

  const markAsReadNow = useCallback(async () => {
    if (!conversationId) return;
    try { await supabase.rpc("mark_conversation_read", { _conversation_id: conversationId }); } catch {}
    setShowNewBar(false);
    setUnreadOnEntry(0);
  }, [conversationId]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 150;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom < threshold;
    userHasScrolledUpRef.current = !atBottom;
    // Hitting the bottom dismisses the blue bar and marks the conversation read.
    if (atBottom && (showNewBar || unreadOnEntry > 0)) {
      void markAsReadNow();
    }
    // Discord-style: when scrolled near the top, fetch older messages
    if (container.scrollTop < 200 && hasMore && !loadingOlder) {
      const prevHeight = container.scrollHeight;
      loadOlder().then(() => {
        requestAnimationFrame(() => {
          const c = messagesContainerRef.current;
          if (c) c.scrollTop = c.scrollHeight - prevHeight;
        });
      });
    }
  }, [hasMore, loadingOlder, loadOlder, showNewBar, unreadOnEntry, markAsReadNow]);

  useEffect(() => {
    const n = messages.length;
    if (n > prevMessageCountRef.current) {
      const lastMsg = messages[n - 1];
      if (lastMsg?.sender_id === user?.id || !userHasScrolledUpRef.current) scrollToBottom();
    }
    prevMessageCountRef.current = n;
  }, [messages.length, messages, user?.id, scrollToBottom]);

  // Reset unread tracking when switching conversations
  useEffect(() => {
    initialUnreadCapturedRef.current = false;
    setFirstUnreadId(null);
    setUnreadOnEntry(0);
    setShowNewBar(false);
  }, [conversationId]);

  // Capture the first-unread snapshot the FIRST time messages are loaded for this conversation.
  useEffect(() => {
    if (loading || messages.length === 0 || initialUnreadCapturedRef.current || !user) return;
    initialUnreadCapturedRef.current = true;
    (async () => {
      const { data: part } = await supabase
        .from("conversation_participants")
        .select("last_read_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle();
      const lastRead = part?.last_read_at;
      if (!lastRead) return;
      const unread = messages.filter(m => m.sender_id !== user.id && new Date(m.created_at).getTime() > new Date(lastRead).getTime());
      if (unread.length > 0) {
        setFirstUnreadId(unread[0].id);
        setUnreadOnEntry(unread.length);
        setShowNewBar(true);
      }
    })();
  }, [loading, messages, conversationId, user]);

  // Scroll to bottom on initial load and conversation switch + auto-focus input.
  // We DO NOT auto-mark-as-read on load — the user has to actually scroll to
  // bottom (or click "Mark as Read") for the blue "New Messages" bar and the
  // red "NEW" divider to dismiss. This is what the user expected and what
  // makes both indicators actually visible after switching chats.
  useEffect(() => {
    if (!loading && messages.length > 0) {
      userHasScrolledUpRef.current = false;
      scrollToBottom();
      const t1 = setTimeout(() => scrollToBottom(), 150);
      const t2 = setTimeout(() => scrollToBottom(), 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loading, conversationId, scrollToBottom]);

  // Auto-focus message input on conversation switch
  useEffect(() => {
    setTimeout(() => messageInputRef.current?.focus(), 50);
  }, [conversationId]);

  // Discord-style "type to focus": pressing any printable key anywhere routes
  // it into the message input. Also keep Enter-anywhere as a no-op focuser.
  useTypeToFocus(messageInputRef);
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

  const handleReply = useCallback((msg: Message) => {
    const { text } = (() => {
      const attachRegex = /\[attachments\](.*?)\[\/attachments\]/s;
      const t = msg.content.replace(attachRegex, "").trim();
      return { text: t || "Attachment" };
    })();
    setReplyTo({ id: msg.id, sender_name: msg.sender_name || "Unknown", content: text });
    setTimeout(() => messageInputRef.current?.focus(), 0);
  }, []);

  const scrollToMessage = useCallback((id: string) => {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1600);
  }, []);

  const handleSend = async () => {
    if (!input.trim() && pendingFiles.length === 0) return;

    const currentInput = input.trim();
    const currentFiles = [...pendingFiles];
    const currentReplyTo = replyTo;

    setInput("");
    setPendingFiles([]);
    setAttachMenuOpen(false);
    setReplyTo(null);
    broadcastStopTyping();
    // Replying to the chat dismisses the red NEW divider AND the blue bar.
    setFirstUnreadId(null);
    setShowNewBar(false);
    setUnreadOnEntry(0);
    void markAsReadNow();

    setUploading(true);

    // Persist the STABLE storage path on each attachment, not a short-lived
    // signed URL. AttachmentItem will sign on demand on every mount/refresh.
    const attachmentUrls: { name: string; path: string; size: number; type: string }[] = [];
    for (const pf of currentFiles) {
      const path = `${conversationId}/${Date.now()}-${pf.file.name}`;
      const { error } = await supabase.storage.from("chat-attachments").upload(path, pf.file);
      if (!error) {
        attachmentUrls.push({ name: pf.file.name, path, size: pf.file.size, type: pf.file.type });
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
      await sendMessage(content, currentReplyTo?.id || null);
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
    let attachments: { name: string; path?: string; url?: string; size: number; type: string }[] = [];
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

  // Build a flat, time-ordered list of "atoms" (single message, divider, or
  // call event) FIRST, then group consecutive same-sender messages. This is
  // the only way to guarantee a call pill sits at exactly the right boundary
  // — grouping before interleaving meant a later message could end up inside
  // a group whose start-timestamp predates the pill, visually placing the
  // pill below messages that are actually older than it.
  type ChatItem =
    | { type: "messages"; sender_id: string; sender_name: string; sender_avatar_url?: string | null; messages: Message[]; timestamp: number }
    | { type: "divider"; label: string; timestamp: number }
    | { type: "call-event"; event: typeof conversationCallEvents[0]; timestamp: number };

  type Atom =
    | { kind: "msg"; ts: number; msg: Message; showDivider: boolean; dividerLabel?: string }
    | { kind: "call"; ts: number; event: typeof conversationCallEvents[0] };

  const atoms: Atom[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const ts = new Date(msg.created_at).getTime();
    const showDivider = i > 0 && shouldShowTimeDivider(messages[i - 1].created_at, msg.created_at);
    atoms.push({
      kind: "msg",
      ts,
      msg,
      showDivider,
      dividerLabel: showDivider ? formatDateDivider(msg.created_at) : undefined,
    });
  }
  for (const evt of conversationCallEvents) {
    atoms.push({ kind: "call", ts: new Date(evt.startedAt).getTime(), event: evt });
  }
  // Stable sort: by ts, with call pills coming BEFORE messages of equal ts
  // (so any newly-arrived message of the same ms appears under the pill).
  atoms.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.kind === b.kind) return 0;
    return a.kind === "call" ? -1 : 1;
  });

  const items: ChatItem[] = [];
  for (const atom of atoms) {
    if (atom.kind === "call") {
      items.push({ type: "call-event", event: atom.event, timestamp: atom.ts });
      continue;
    }
    // message atom
    if (atom.showDivider && atom.dividerLabel) {
      items.push({ type: "divider", label: atom.dividerLabel, timestamp: atom.ts - 1 });
    }
    const last = items[items.length - 1];
    if (last && last.type === "messages" && last.sender_id === atom.msg.sender_id) {
      last.messages.push(atom.msg);
    } else {
      items.push({
        type: "messages",
        sender_id: atom.msg.sender_id,
        sender_name: atom.msg.sender_name || "Unknown",
        sender_avatar_url: atom.msg.sender_avatar_url,
        messages: [atom.msg],
        timestamp: atom.ts,
      });
    }
  }

  const showMembersPanel = !!(showGroupMembers && conversation?.is_group);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Blue "New Messages" bar — sits ABOVE the call panel so it's always visible */}
      {showNewBar && unreadOnEntry > 0 && (
        <div
          className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 text-xs font-semibold"
          style={{ backgroundColor: "#5865f2", color: "#ffffff" }}
        >
          <span>New Messages — {unreadOnEntry}</span>
          <button
            onClick={() => { void markAsReadNow(); }}
            className="rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors hover:bg-white/15"
          >
            Mark as Read
          </button>
        </div>
      )}

      {/* Discord-style call panel — group call OR 1-on-1 call (mutually exclusive) */}
      <div className="shrink-0 max-h-[50vh] overflow-y-auto">
        {conversation?.is_group ? (
          <GroupCallPanel conversationId={conversationId} />
        ) : (
          <CallPanel
            conversationId={conversationId}
            recipientName={recipientName}
            recipientAvatar={recipientAvatar}
            recipientUserId={recipientUserId}
          />
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        data-chat-scroll
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ minHeight: 0, overscrollBehavior: "contain" }}
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
                const canRejoin = item.event.state === "ongoing" && !conversation?.is_group && !!recipientUserId && activeCall?.conversationId !== conversationId;
                const isRejoiningThisEvent = rejoiningEventId === item.event.id;
                return (
                  <CallEventMessage
                    key={item.event.id}
                    state={item.event.state}
                    startedAt={item.event.startedAt}
                    endedAt={item.event.endedAt}
                    joinDisabled={isRejoiningThisEvent}
                    joinLabel={isRejoiningThisEvent ? "Rejoining..." : "Rejoin"}
                    onJoin={
                      canRejoin
                        ? () => {
                            if (isRejoiningThisEvent) return;
                            setRejoiningEventId(item.event.id);
                            try {
                              startCall(conversationId, recipientUserId!, recipientName);
                            } catch {
                              setRejoiningEventId(null);
                            }
                          }
                        : undefined
                    }
                  />
                );
              }

              const groupContainsFirstUnread = !!firstUnreadId && item.messages.some(m => m.id === firstUnreadId);
              return (
                <div key={idx}>
                  {groupContainsFirstUnread && (
                    <div className="my-3 flex items-center gap-2" data-new-divider>
                      <div className="flex-1 h-px" style={{ backgroundColor: "#ed4245" }} />
                      <span className="text-[10px] font-bold tracking-wider px-2 rounded" style={{ color: "#ffffff", backgroundColor: "#ed4245" }}>NEW</span>
                    </div>
                  )}
                <div className="mt-4 first:mt-0 flex gap-3 rounded px-2 py-1 relative group" style={{ transition: "background-color 0.15s" }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--app-hover, #2e3035)")} onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
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
                      const isHighlighted = highlightedId === msg.id;
                      return (
                        <MessageContextMenu
                          key={msg.id}
                          messageId={msg.id}
                          messageContent={msg.content}
                          isOwnMessage={msg.sender_id === user?.id}
                          onReply={() => handleReply(msg)}
                        >
                          <div
                            ref={(el) => {
                              if (el) messageRefs.current.set(msg.id, el);
                              else messageRefs.current.delete(msg.id);
                            }}
                            className="relative group/msg py-0.5 rounded transition-colors"
                            style={{ backgroundColor: isHighlighted ? "rgba(88,101,242,0.18)" : "transparent" }}
                          >
                            {/* Hover action buttons for individual messages */}
                            <div className="absolute -top-3 right-0 flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-lg opacity-0 group-hover/msg:opacity-100 transition-opacity z-10"
                              style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)", borderColor: "var(--app-border, #2b2d31)" }}
                            >
                              <MessageActions
                                messageId={msg.id}
                                messageContent={msg.content}
                                isOwnMessage={msg.sender_id === user?.id}
                                onReply={() => handleReply(msg)}
                              />
                            </div>
                            {msg.reply_to && (() => {
                              const rawReply = msg.reply_to.content.replace(/\[attachments\].*?\[\/attachments\]/s, "").trim();
                              const isGifReply = /^https?:\/\/\S*\.(gif|giphy|tenor)/i.test(rawReply);
                              return (
                                <button
                                  type="button"
                                  onClick={() => scrollToMessage(msg.reply_to!.id)}
                                  className="flex items-center gap-1.5 mb-0.5 text-xs hover:opacity-80 transition-opacity max-w-full min-w-0 overflow-hidden"
                                  style={{ color: "var(--app-text-secondary, #949ba4)" }}
                                >
                                  <ReplyIcon className="h-3 w-3 -scale-x-100 shrink-0" />
                                  <span className="font-semibold truncate min-w-0" style={{ color: "var(--app-text-primary, #dbdee1)" }}>
                                    @{msg.reply_to.sender_name}
                                  </span>
                                  {isGifReply ? (
                                    <span className="flex items-center gap-1 opacity-80 shrink-0">
                                      <img src={gifIcon} alt="" className="h-3 w-3 invert opacity-80" />
                                      <span className="font-semibold">GIF</span>
                                    </span>
                                  ) : (
                                    <span className="truncate opacity-80 min-w-0">
                                      {rawReply || "Attachment"}
                                    </span>
                                  )}
                                </button>
                              );
                            })()}
                            {text && (
                              /^https?:\/\/.*\.(gif|giphy)/i.test(text) ? (
                                <InlineGif url={text} />
                              ) : (
                                <>
                                  <p className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${msg.status === "sending" ? "opacity-50" : ""}`} style={{ color: "var(--app-text-primary, #dbdee1)" }}>
                                    {linkifyText(text)}
                                  </p>
                                  {(() => {
                                    const firstUrl = extractFirstUrl(text);
                                    return firstUrl ? <LinkPreview url={firstUrl} /> : null;
                                  })()}
                                </>
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


      {/* Reply pill */}
      {replyTo && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 text-xs border-t"
          style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", borderColor: "var(--app-border, #1e1f22)", color: "var(--app-text-secondary, #949ba4)" }}
        >
          <ReplyIcon className="h-3.5 w-3.5 -scale-x-100 shrink-0" />
          <span className="truncate">
            Replying to <strong className="font-semibold" style={{ color: "var(--app-text-primary, #dbdee1)" }}>@{replyTo.sender_name}</strong>
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded hover:bg-white/10 shrink-0"
            title="Cancel reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
        <div className="flex items-end gap-2 rounded-lg px-4 py-2.5 relative" style={{ backgroundColor: "var(--app-input, #383a40)" }}>
          <div className="relative pb-1">
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

          <textarea
            ref={messageInputRef}
            rows={1}
            value={input}
            maxLength={1000}
            onChange={(e) => {
              // Hard truncate (defensive — maxLength already enforces it)
              const v = e.target.value.slice(0, 1000);
              setInput(v);
              if (v.trim()) broadcastTyping();
              else broadcastStopTyping();
            }}
            onBlur={broadcastStopTyping}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={(e) => {
              // Ctrl+V image paste — grab image items from the clipboard and queue them as attachments
              const items = e.clipboardData?.items;
              if (!items) return;
              const imageFiles: File[] = [];
              for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (it.kind === "file" && it.type.startsWith("image/")) {
                  const f = it.getAsFile();
                  if (f) {
                    const ext = (f.type.split("/")[1] || "png").split("+")[0];
                    const named = new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type });
                    imageFiles.push(named);
                  }
                }
              }
              if (imageFiles.length > 0) {
                e.preventDefault();
                setPendingFiles((prev) => [
                  ...prev,
                  ...imageFiles.map((f) => ({ file: f, id: `paste-${Date.now()}-${Math.random()}` })),
                ]);
                return;
              }
              // Truncate pasted text so we never exceed the limit
              const pastedText = e.clipboardData?.getData("text");
              if (pastedText && input.length + pastedText.length > 1000) {
                e.preventDefault();
                const room = Math.max(0, 1000 - input.length);
                const next = (input + pastedText.slice(0, room)).slice(0, 1000);
                setInput(next);
              }
            }}
            placeholder={`Message @${recipientName}`}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[#6d6f78] leading-[1.4] py-1"
            data-typing-input
            style={{ color: "var(--app-text-primary, #dbdee1)", maxHeight: "168px" }}
          />

          {input.length >= 750 && (
            <span
              className="absolute bottom-1 right-12 text-[11px] font-medium tabular-nums select-none pointer-events-none"
              style={{
                color:
                  input.length >= 1000
                    ? "#ed4245"
                    : input.length >= 900
                      ? "#faa61a"
                      : "var(--app-text-secondary, #949ba4)",
              }}
            >
              {input.length}/1000
            </span>
          )}

          <div className="relative flex items-center pb-1">
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
            className="flex items-center justify-center disabled:opacity-30 transition-opacity pb-1"
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
      {showMembersPanel && conversation && (
        <GroupMembersPanel
          conversation={conversation}
          onClose={() => {}}
          onLeftGroup={() => onLeftGroup?.()}
        />
      )}
    </div>
  );
};

export default ChatView;
