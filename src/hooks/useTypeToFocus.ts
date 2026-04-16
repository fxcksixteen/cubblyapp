import { useEffect } from "react";

/**
 * Discord-style "type-to-focus": when the user starts pressing printable keys
 * anywhere in the app and no input/textarea/contenteditable is currently
 * focused, focus the message input and let the keystroke land there.
 *
 * Pass a ref to your message input. Hook is a no-op when ref is null/unmounted.
 *
 * We deliberately ignore: meta combos (Ctrl/Cmd/Alt), navigation keys, function
 * keys, and the modifier keys themselves so this never hijacks shortcuts.
 */
export function useTypeToFocus(
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const isTypingTarget = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      // Skip modifier combos / shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Already typing somewhere
      if (isTypingTarget(document.activeElement)) return;

      // Only react to printable keys (length === 1) — also accept Backspace so
      // the user can immediately delete after auto-focus feels natural.
      const key = e.key;
      const isPrintable = key.length === 1;
      if (!isPrintable) return;

      const input = inputRef.current;
      if (!input) return;

      // Focus and let the original keystroke land (do NOT preventDefault — the
      // browser will deliver this same character to the now-focused input).
      input.focus();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inputRef, enabled]);
}
