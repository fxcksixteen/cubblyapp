import React from "react";

// Matches http(s) URLs and bare www.* URLs. Stops at whitespace and trailing
// punctuation that's almost never part of an actual URL.
const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"])/gi;

/** Returns the first http(s) URL in the text, or null. */
export function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_REGEX);
  if (!m || m.length === 0) return null;
  const raw = m[0];
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/**
 * Splits text into spans of plain text and clickable <a> tags.
 * Safe for use inside chat bubbles — opens links in a new tab with rel hardening.
 */
export function linkifyText(text: string): React.ReactNode[] {
  if (!text) return [text];
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // We need a fresh regex each call because of the `g` flag's lastIndex state.
  const re = new RegExp(URL_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart));
    }
    const raw = match[0];
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    parts.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-[#00a8fc] hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {raw}
      </a>,
    );
    lastIndex = matchEnd;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
