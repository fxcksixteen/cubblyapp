import React from "react";
import { linkifyText } from "@/lib/linkify";
import { MENTION_REGEX_SOURCE } from "@/lib/mentions";

export interface MentionResolver {
  /** Returns the display name to show inside `@Name` chips. */
  resolve: (userId: string) => string | undefined;
  /** Current viewer's user id — chips targeting them get the yellow highlight. */
  selfUserId?: string | null;
  /** Called when a chip is clicked. */
  onClick?: (userId: string, name: string, e: React.MouseEvent) => void;
}

/**
 * Renders chat message body text:
 *   - <@uuid> tokens → @Name chips (yellow when self)
 *   - URLs           → clickable links
 *
 * Splits the body into segments around mention tokens first, then runs
 * `linkifyText` on the non-token segments so we never URL-ify a uuid.
 */
export function renderMessageBody(
  text: string,
  resolver: MentionResolver,
): React.ReactNode[] {
  if (!text) return [];
  const re = new RegExp(MENTION_REGEX_SOURCE, "g");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<React.Fragment key={`t-${key++}`}>{linkifyText(text.slice(last, m.index))}</React.Fragment>);
    }
    const uid = m[1].toLowerCase();
    const name = resolver.resolve(uid) || "user";
    const isSelf = !!resolver.selfUserId && uid === resolver.selfUserId.toLowerCase();
    out.push(
      <span
        key={`m-${key++}`}
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          resolver.onClick?.(uid, name, e);
        }}
        className="inline-flex items-center rounded px-1 py-0.5 font-medium cursor-pointer transition-colors"
        style={
          isSelf
            ? { backgroundColor: "rgba(250, 166, 26, 0.20)", color: "#faa61a" }
            : { backgroundColor: "rgba(88, 101, 242, 0.20)", color: "#9aa6ff" }
        }
      >
        @{name}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(<React.Fragment key={`t-${key++}`}>{linkifyText(text.slice(last))}</React.Fragment>);
  }
  return out;
}
