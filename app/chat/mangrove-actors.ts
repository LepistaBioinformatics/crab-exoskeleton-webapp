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
// BRACKETS AND NOT A MIDDLE DOT, because the meta line joins its own parts with one:
// `by a person · alice · shared with a person · bob` is four items to the eye and two
// answers in fact, which is the illegibility this module exists to fix, one level
// down.
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
 * The whole audience as one phrase, or null where there is nothing honest to say.
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
  if (audience.length === 0) {
    return own ? t.mangrove.sharedWith.replace("{who}", t.mangrove.audiencePrivate) : null;
  }
  return t.mangrove.sharedWith.replace(
    "{who}",
    audience.map((a) => audienceLabel(a, identity, t)).join(", "),
  );
}
