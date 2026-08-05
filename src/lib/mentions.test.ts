import { describe, expect, it } from "vitest";
import {
  serializeMentions, stripMentionTokens, bodyMentionsUser, bodyMentionsEveryone,
  extractMentionedUserIds, EVERYONE_SENTINEL, EVERYONE_TOKEN,
} from "./mentions";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

describe("@everyone serialization", () => {
  it("turns a picked @everyone into the wire token", () => {
    const picked = new Map([[EVERYONE_SENTINEL, "everyone"]]);
    expect(serializeMentions("hey @everyone look", picked)).toBe(`hey ${EVERYONE_TOKEN} look`);
  });

  it("only converts it when the user actually picked it from the autocomplete", () => {
    // Same rule as user mentions: typing the text by hand is not a ping.
    expect(serializeMentions("saying @everyone casually", new Map())).toBe("saying @everyone casually");
  });

  it("handles @everyone at the very end of a message", () => {
    const picked = new Map([[EVERYONE_SENTINEL, "everyone"]]);
    expect(serializeMentions("ping @everyone", picked)).toBe(`ping ${EVERYONE_TOKEN}`);
  });

  it("does not fire on a longer word starting with everyone", () => {
    const picked = new Map([[EVERYONE_SENTINEL, "everyone"]]);
    expect(serializeMentions("@everyonelse", picked)).toBe("@everyonelse");
  });

  it("coexists with user mentions in one message", () => {
    const picked = new Map([[EVERYONE_SENTINEL, "everyone"], [ALICE, "Alice"]]);
    const out = serializeMentions("@Alice tell @everyone", picked);
    expect(out).toBe(`<@${ALICE}> tell ${EVERYONE_TOKEN}`);
  });
});

describe("@everyone notification routing", () => {
  it("counts as a mention for ANY user — that is the whole point", () => {
    const body = `heads up ${EVERYONE_TOKEN}`;
    expect(bodyMentionsUser(body, ALICE)).toBe(true);
    expect(bodyMentionsUser(body, BOB)).toBe(true);
  });

  it("is detected on its own", () => {
    expect(bodyMentionsEveryone(`hi ${EVERYONE_TOKEN}`)).toBe(true);
    expect(bodyMentionsEveryone("plain message")).toBe(false);
    expect(bodyMentionsEveryone(null)).toBe(false);
  });

  it("a normal message still only pings the person actually tagged", () => {
    const body = `hey <@${ALICE}>`;
    expect(bodyMentionsUser(body, ALICE)).toBe(true);
    expect(bodyMentionsUser(body, BOB)).toBe(false);
  });

  it("is not mistaken for a user id", () => {
    expect(extractMentionedUserIds(`x ${EVERYONE_TOKEN} y`)).toEqual([]);
  });
});

describe("@everyone previews", () => {
  it("renders back to readable text in notifications and reply quotes", () => {
    expect(stripMentionTokens(`yo ${EVERYONE_TOKEN}`)).toBe("yo @everyone");
  });

  it("strips both kinds together", () => {
    const out = stripMentionTokens(`<@${ALICE}> and ${EVERYONE_TOKEN}`, () => "Alice");
    expect(out).toBe("@Alice and @everyone");
  });
});
