// When a message was written, as a person reads it.
//
// React-free so the rules below are tested without mounting a conversation, and
// because every one of them is a judgement about what a reader needs rather than
// about layout.
//
// TWO RENDERINGS OF ONE INSTANT. The visible label is short -- a time today, a
// day and month before that -- because a column of full timestamps beside every
// message is noise that hides the one you are looking for. The full instant goes
// in the title and in the machine-readable attribute, so following a
// conversation across days does not require guessing which day "14:32" was.
//
// Matches conversation-tree.tsx's formatWhen, deliberately: two places in this
// app answer "when was this?" and a reader moving between them should not have
// to learn a second shape.

/** One instant, rendered for a reader and for a machine. */
export interface MessageTime {
  /** Date and time together: "19 de set. 14:32". */
  label: string;
  /** The whole instant, for the title attribute. */
  full: string;
  /** ISO-8601, for <time dateTime>. */
  machine: string;
}

/**
 * Reads a message's `created_at` into something renderable, or null when there
 * is nothing trustworthy to show.
 *
 * NULL RATHER THAN A GUESS, in three cases that all look alike from the call
 * site: the field is absent, it is not a date, or it parses to an invalid one. A
 * message with no recorded time is ordinary -- the transcript's own field is
 * optional, and a message still streaming has not been written yet -- and
 * inventing "now" for it would put a timestamp on the screen that is not a fact
 * about the message.
 */
export function messageTime(
  createdAt: string | undefined,
  tag: string,
  now: Date = new Date(),
): MessageTime | null {
  if (typeof createdAt !== "string" || createdAt.trim() === "") return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;

  // BOTH, ALWAYS. This read the clock for today and the day for anything older,
  // which is the idiom a conversation LIST uses -- there, one line per
  // conversation, the reader wants the freshest thing distinguishable at a
  // glance. Inside a conversation the question is different: following a thread
  // that ran across an evening and picked up the next morning, "14:32" alone
  // cannot say which one, and the reader should not have to hover to find out.
  //
  // The YEAR appears only when it is not the current one. Carrying it on every
  // message would double the label's width to disambiguate a case that almost
  // never arises, and the full instant is in the title for when it does.
  const sameYear = d.getFullYear() === now.getFullYear();
  return {
    label: d.toLocaleString(tag, {
      day: "2-digit",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
      hour: "2-digit",
      minute: "2-digit",
    }),
    // The whole thing, spelled out, for the title -- what the label abbreviates.
    full: d.toLocaleString(tag, { dateStyle: "long", timeStyle: "short" }),
    machine: d.toISOString(),
  };
}
