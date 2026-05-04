import { Switch } from "@/components/ui/switch";
import { useLocalSetting } from "@/hooks/useLocalSetting";
import { Eye, MessageCircle, Image as ImageIcon, Smile, Type } from "lucide-react";

interface ChatSettingsProps {
  cardStyle: React.CSSProperties;
}

const ChatSettings = ({ cardStyle }: ChatSettingsProps) => {
  const [showTimestamps, setShowTimestamps] = useLocalSetting("chat.showTimestamps", true);
  const [compact, setCompact] = useLocalSetting("chat.compactMode", false);
  const [autoplayGifs, setAutoplayGifs] = useLocalSetting("chat.autoplayGifs", true);
  const [showEmojiReactions, setShowEmojiReactions] = useLocalSetting("chat.showEmojiReactions", true);
  const [convertEmoticons, setConvertEmoticons] = useLocalSetting("chat.convertEmoticons", true);
  const [linkPreviews, setLinkPreviews] = useLocalSetting("chat.linkPreviews", true);
  const [readReceipts, setReadReceipts] = useLocalSetting("chat.readReceipts", true);
  const [typingIndicator, setTypingIndicator] = useLocalSetting("chat.typingIndicator", true);
  const [fontSize, setFontSize] = useLocalSetting<number>("chat.fontSize", 15);
  const [spellcheck, setSpellcheck] = useLocalSetting("chat.spellcheck", true);

  const Row = ({
    icon: Icon,
    title,
    desc,
    value,
    onChange,
  }: {
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    title: string;
    desc: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--app-text-secondary)" }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{title}</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>{desc}</p>
        </div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Chat</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          How messages, media, and reactions appear in conversations.
        </p>
      </div>

      <div className="rounded-[24px] border p-5 space-y-5" style={cardStyle}>
        <Row icon={MessageCircle} title="Show timestamps" desc="Display the send time next to each message." value={showTimestamps} onChange={setShowTimestamps} />
        <Row icon={Type} title="Compact mode" desc="Tighter spacing — fits more messages on screen." value={compact} onChange={setCompact} />
        <Row icon={ImageIcon} title="Autoplay GIFs" desc="Animate GIFs automatically. Off saves bandwidth." value={autoplayGifs} onChange={setAutoplayGifs} />
        <Row icon={Smile} title="Show reactions" desc="Display emoji reactions under messages." value={showEmojiReactions} onChange={setShowEmojiReactions} />
        <Row icon={Smile} title="Convert text emoticons" desc='Turn ":)" into 🙂 as you type.' value={convertEmoticons} onChange={setConvertEmoticons} />
        <Row icon={ImageIcon} title="Inline link previews" desc="Show preview cards for shared links." value={linkPreviews} onChange={setLinkPreviews} />
        <Row icon={Eye} title="Read receipts" desc="Let friends see when you've read their messages." value={readReceipts} onChange={setReadReceipts} />
        <Row icon={Eye} title="Typing indicator" desc="Show others when you're typing." value={typingIndicator} onChange={setTypingIndicator} />
      </div>

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>Message font size</p>
        <div className="mt-3 flex items-center gap-4">
          <input
            type="range"
            min={12}
            max={20}
            step={1}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-[#5865f2]"
          />
          <span className="w-12 text-right text-sm font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
            {fontSize}px
          </span>
        </div>
        <p className="mt-3 rounded-xl px-3 py-2" style={{ backgroundColor: "var(--app-bg-secondary)", color: "var(--app-text-primary)", fontSize: `${fontSize}px` }}>
          Hey, this is what your messages look like at this size.
        </p>
      </div>

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <Row icon={Type} title="Spellcheck" desc="Underline misspelled words in the message box." value={spellcheck} onChange={setSpellcheck} />
      </div>
    </div>
  );
};

export default ChatSettings;
