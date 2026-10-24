import type { ApplianceId } from "./appliances";

/** The web conversation owns persona, history and planner validation. Transport only delivers it. */
export type MessageConversationReply = {
  text: string;
  source: "openai" | "local";
  notice?: string;
};
export type MessageConversationOptions = { signal: AbortSignal; messageId: string };
export type MessageConversationHandler = (
  applianceId: ApplianceId,
  text: string,
  options: MessageConversationOptions,
) => Promise<MessageConversationReply | undefined> | MessageConversationReply | string | undefined;

/** Completed turns from the shared web conversation, never another model invocation. */
export type MessageSyncTurn = {
  id: string;
  applianceId: ApplianceId;
  userText: string;
  reply: MessageConversationReply;
  origin: "web" | "imessage";
};
