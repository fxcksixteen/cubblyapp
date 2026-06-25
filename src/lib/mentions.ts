// Discord-style @mention serialization.
//
// Wire format embedded in `messages.content`:
//
//     <@uuid>
//
// On send we replace `@DisplayName` (only for users the sender actually
// picked via the autocomplete) with `<@uuid>` tokens. On render we expand
// the tokens back into chips with the *current* display name. The token
// also tells `useUnreadCounts` who was tagged so it can bypass DND.

const MENTION_TOKEN = /<@([0-9a-fA-F-]{36})>/g;

/** Returns true if the body mentions the given user. */
export function bodyMentionsUser(body: string | null | undefined, userId: string): boolean {
  if (!body || !userId) return false;
  // Cheap pre-check, then exact.
  if (body.indexOf(userId) === -1) return false;
  MENTION_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_TOKEN.exec(body)) !== null) {
    if (m[1].toLowerCase() === userId.toLowerCase()) return true;
  }
  return false;
}

/** Collects every userId tagged anywhere in `body`. */
export function extractMentionedUserIds(body: string): string[] {
  const out = new Set<string>();
  if (!body) return [];
  MENTION_TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_TOKEN.exec(body)) !== null) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}

/**
 * Serialize textarea input into the wire format. For each picked mention,
 * every plain `@DisplayName` occurrence is replaced with `<@uuid>`.
 * Longest names first so "@Alex" doesn't gobble "@Alexander".
 */
export function serializeMentions(
  text: string,
  picked: Map<string, string>, // userId -> displayName at time of pick
): string {
  if (!text || picked.size === 0) return text;
  const entries = Array.from(picked.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );
  let out = text;
  for (const [userId, name] of entries) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match @Name when followed by end-of-string / whitespace / punctuation.
    const re = new RegExp(`@${escaped}(?=$|[\\s.,!?;:'"\\)\\]])`, "g");
    out = out.replace(re, `<@${userId}>`);
  }
  return out;
}

/** Strip mention tokens for plain-text previews (notifications, reply quotes). */
export function stripMentionTokens(text: string, resolveName?: (userId: string) => string | undefined): string {
  if (!text) return text;
  return text.replace(MENTION_TOKEN, (_, id) => {
    const name = resolveName?.(id);
    return name ? `@${name}` : "@user";
  });
}

export const MENTION_REGEX_SOURCE = MENTION_TOKEN.source;
