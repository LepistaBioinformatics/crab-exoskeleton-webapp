import type { MangroveIdentity } from "@/lib/mangrove";
import type { ChatDict } from "@/lib/i18n/chat";

// WHO WROTE IT, AND WHO IT REACHED -- in words, not in uuids.
//
// Both answers were already on the timeline and neither was legible: an author was
// rendered as `<accId>`, or `<accId> (bot)` for a service actor, and an audience as
// the literal words "subscription" and "tenant". Hardcoded English, outside i18n, and
// dominated by an id nobody reads.
//
// THE THING A MEMBER ACTUALLY WANTS TO KNOW IS WHETHER IT IS THEIRS. "you" and "your
// agent" are the two labels that carry real information here, and they are the only
// two this app can resolve: `readIdentity` returns the member's OWN two actor ids, and
// nothing else in the mangrove maps an id to a person.
//
// AN ARBITRARY ACTOR CANNOT BE NAMED, and these functions do not pretend otherwise.
// The directory answers a needle -- an address you already have -- and returns an id
// only in prefix mode; there is no bulk resolve to build one on. So somebody else is
// "a person" or "an agent" WITH THEIR ID IN BRACKETS: the kind is the part that was
// missing, and the id is the part that tells two strangers apart and matches what the
// People tab hands out. Dropping it would be a loss dressed as a tidy-up.
//
// BRACKETS AND NOT A MIDDLE DOT. A recipients column holds a LIST -- `a person
// (alice), a person (bob)` -- and a separator that also reads as a list separator
// turns two people into four entries to the eye. The brackets keep the kind and the
// id one unit whatever the value is set beside.
//
// IDENTITY IS NULL ON THE FIRST PAINT, and that is why "a person (<id>)" is the
// fallback rather than something that would have to be corrected. A byline that says
// "a person" and becomes "you" a beat later has never been wrong; one that guessed
// would have been.

const ACTOR = /^mangrove:actor:(.+):(person|service)$/;

/** Whether this actor is one of the member's own two. */
export function isMine(actorId: string, identity: MangroveIdentity | null): boolean {
  if (!identity) return false;
  return actorId === identity.personId || actorId === identity.serviceId;
}

/** An actor, in words: you, your agent, or somebody's person/agent and their id. */
export function actorLabel(
  actorId: string,
  identity: MangroveIdentity | null,
  t: ChatDict,
): string {
  if (identity && actorId === identity.personId) return t.mangrove.actorYou;
  if (identity && actorId === identity.serviceId) return t.mangrove.actorYourAgent;
  const m = ACTOR.exec(actorId);
  // Something this client does not know the shape of. Shown as it arrived rather
  // than described wrongly.
  if (!m) return actorId;
  const kind = m[2] === "service" ? t.mangrove.actorAgent : t.mangrove.actorPerson;
  return `${kind} (${m[1]})`;
}

/** One entry of an audience: a group by name, or an actor as above. */
export function audienceLabel(
  id: string,
  identity: MangroveIdentity | null,
  t: ChatDict,
): string {
  if (id.startsWith("mangrove:group:subscription:")) return t.mangrove.audienceSubscription;
  if (id.startsWith("mangrove:group:tenant:")) return t.mangrove.audienceTenant;
  return actorLabel(id, identity, t);
}

/**
 * Everyone this reached, as one value, or null where there is nothing honest to say.
 *
 * A VALUE AND NOT A SENTENCE. It used to come back as "shared with this subscription",
 * because it was read inline after the cell and the byline. It is a column under a
 * heading that already asks the question, so the preposition would be repeated on
 * every card.
 *
 * NULL IS NOT THE EMPTY STRING: a card with nothing honest to say about who else
 * received this leaves the column OUT, rather than printing a heading over a blank.
 *
 * AN EMPTY AUDIENCE IS ONLY AN ANSWER ON YOUR OWN POST. Published with both lists
 * empty means published to the author alone, which is worth saying out loud -- on
 * somebody else's post the timeline is simply not telling us who else received it,
 * and "only you" would be an invention.
 */
export function audienceSummary(
  audience: readonly string[],
  identity: MangroveIdentity | null,
  t: ChatDict,
  own: boolean,
): string | null {
  if (audience.length === 0) return own ? t.mangrove.audiencePrivate : null;
  return audience.map((a) => audienceLabel(a, identity, t)).join(", ");
}
