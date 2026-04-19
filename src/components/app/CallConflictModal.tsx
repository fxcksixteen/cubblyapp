import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface CallConflictModalProps {
  open: boolean;
  variant: "elsewhere" | "same-device";
  /** For elsewhere: the conversation name on the other device (optional). */
  currentLocation?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const CallConflictModal = ({ open, variant, currentLocation, onConfirm, onCancel }: CallConflictModalProps) => {
  const title = variant === "elsewhere"
    ? "You're already in a call on another device"
    : "End your current call?";
  const desc = variant === "elsewhere"
    ? "Looks like you're in a call on a different device or window right now. To start this call here, we'll disconnect you from the other device first."
    : "You're already in a call. Starting this new one will end your current call. Continue?";
  const confirmLabel = variant === "elsewhere" ? "Disconnect & Reconnect Here" : "End Call & Start New";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="border-0 p-0 max-w-md" style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}>
        <div className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl font-bold" style={{ color: "var(--app-text-primary, #f2f3f5)" }}>
            {title}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-relaxed" style={{ color: "var(--app-text-secondary, #b5bac1)" }}>
            {desc}
            {variant === "elsewhere" && currentLocation && (
              <>
                <br />
                <span className="block mt-2 text-xs opacity-80">Other device: <strong>{currentLocation}</strong></span>
              </>
            )}
          </DialogDescription>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 rounded-b-lg" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: "var(--app-text-primary, #f2f3f5)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#5865f2" }}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CallConflictModal;
