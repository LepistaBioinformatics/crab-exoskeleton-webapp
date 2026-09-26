import type { Workspace } from "@/app/chat/fragment";
import { errorCode } from "@/lib/i18n/errors";
import { split } from "@/lib/frontmatter";
import { getJson, workspaceQuery } from "@/lib/workspaceApi";

// The member's own skills, and the two layers above them they cannot touch.
//
// Three layers reach an agent and they are INDISTINGUISHABLE BY PATH: the operator's
// are bind-mounted into the very directory the member's own live in, so a listing that
// guessed from the filename would report an empty mountpoint as one of the member's
// skills. `origin` is therefore always the server's answer and never derived here
// (spec DEC-2).

export const SKILL_ORIGINS = ["member", "shared", "managed"] as const;

/**
 * Who owns a skill, and therefore whether it can be changed.
 *
 * ALSO THE ORDER THE PANEL GROUPS BY (FR-2): the member's own first, because that is
 * the layer they can act on; the administrator's and the operator's after it, as
 * context for why the agent behaves as it does.
 */
export type SkillOrigin = (typeof SKILL_ORIGINS)[number];

/** `docker.SkillMeta` plus the two fields the member surface adds (backend FR-2). */
export interface MemberSkill {
  name: string;
  description: string;
  size: number;
  modifiedAt?: string;
  hasFiles: boolean;
  origin: SkillOrigin;
  /**
   * An administrator published a skill with this same name, and the harness resolves
   * the collision in their favour — so this file is on disk and does nothing.
   *
   * OPTIONAL, and absent is not "false": the proxy computes it only for the ganglion
   * (backend DEC-9), because picoclaw's collision precedence has never been checked.
   * Absent means "no claim either way", which is why the marker is driven by an
   * explicit `true`.
   */
  shadowed?: boolean;
}

/**
 * One file inside a skill's directory.
 *
 * A skill IS a directory: `SKILL.md` is the skill itself, and everything beside it —
 * templates, scripts, notes, at any depth — is a supporting file the skill tells the
 * agent to open. `path` is relative to that directory and slash-separated.
 *
 * Each file carries its OWN `modifiedAt`, which is what the conditional write is
 * against (backend DEC-7). A skill has no single version: the agent's evolution can
 * rewrite one template and leave the rest untouched.
 */
export interface SkillFile {
  path: string;
  size: number;
  modifiedAt: string;
  /**
   * Not text — invalid UTF-8, or a NUL somewhere in it.
   *
   * SET ONLY ON A READ, never on a listing: deciding it costs the file's bytes, and
   * the proxy will not walk every file of a skill to label them. So a listing row
   * that says nothing is not "this is text"; it is "nobody has looked yet".
   *
   * When it is true the content comes back empty, and the panel shows the file
   * rather than offering to overwrite a PNG with a lossy decoding of itself.
   */
  binary?: boolean;
}

/** The one file that IS the skill. Everything else in the directory supports it. */
export const SKILL_DOC = "SKILL.md";

/** The proxy's own `skillNameRe`, mirrored so a bad name fails before the round trip. */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * THE ONE THING THIS CLIENT MUST NOT SEND.
 *
 * `workspaceQuery` spreads `project` whenever the view is inside one, because every
 * other panel addresses the project's own workspace directory. Skills do not: the
 * harness's loader is fixed on the MAIN workspace at boot, so a skill written into
 * `workspace-<id>/skills` is read by nothing (backend DEC-5). Forwarding the project
 * would let a member write, and be told they had saved, a file that is inert.
 *
 * Cleared here rather than by hand-rolling the query, so the parameters this surface
 * DOES share with the others — tenant, subscription, the role that picks the gateway
 * path — still come from the one helper that owns their spelling.
 */
function skillsQuery(workspace: Workspace, extra: Record<string, string> = {}): string {
  return workspaceQuery({ ...workspace, p: null }, extra);
}

export function listSkills(workspace: Workspace): Promise<MemberSkill[]> {
  return getJson<{ skills?: MemberSkill[] }>("/api/skills", skillsQuery(workspace)).then(
    (data) => (Array.isArray(data.skills) ? data.skills : []),
  );
}

/**
 * Everything inside one skill, for all three layers.
 *
 * The read-only layers are listed too, and that is the point of listing them at all:
 * an administrator's skill that tells the agent to fill in a template is unreadable
 * as a skill while the template is invisible.
 *
 * `origin` is the server's answer, as everywhere else (spec DEC-2) — and the panel
 * gates writing on it being exactly `"member"`, so a response that carried no origin
 * fails closed rather than offering an editor over the operator's files.
 */
export function listSkillFiles(
  workspace: Workspace,
  name: string,
): Promise<{ files: SkillFile[]; origin: SkillOrigin }> {
  return getJson<{ files?: SkillFile[]; origin: SkillOrigin }>(
    "/api/skills/files",
    skillsQuery(workspace, { name }),
  ).then((data) => ({
    files: orderSkillFiles(Array.isArray(data.files) ? data.files : []),
    origin: data.origin,
  }));
}

/**
 * `SKILL.md` first, then the rest by path.
 *
 * Ordered HERE rather than trusted from the server: the proxy walks a directory tree
 * and the skill itself arrives wherever that walk reached it. The one file the member
 * came to read must not sit in the middle of a list of templates.
 */
export function orderSkillFiles(files: SkillFile[]): SkillFile[] {
  return [...files].sort((a, b) => {
    if (a.path === SKILL_DOC) return -1;
    if (b.path === SKILL_DOC) return 1;
    return a.path.localeCompare(b.path);
  });
}

/**
 * One file of a skill, defaulting to the skill itself.
 *
 * `path` is left out of the query when the caller does not name one, so the proxy
 * applies its own `SKILL.md` default and this stays the same request the panel made
 * before supporting files existed.
 */
export function readSkill(
  workspace: Workspace,
  name: string,
  path?: string,
): Promise<{
  name: string;
  path: string;
  content: string;
  file: SkillFile;
  origin: SkillOrigin;
}> {
  return getJson("/api/skills/doc", skillsQuery(workspace, { name, ...(path ? { path } : {}) }));
}

/**
 * Write one file of a skill, conditionally.
 *
 * `modifiedAt` is the version the caller last read, and its ABSENCE means "create":
 * the proxy refuses an existing name then (backend DEC-7). The two 409s that follow
 * from that are different things to say to a member — "pick another name" against
 * "the agent rewrote this while you had it open" — so this is where they are told
 * apart, at the only layer that knows which of the two calls it made.
 *
 * Returns the stored file so the caller can hold the NEW `modifiedAt`. Saving twice
 * in one sitting with the value from the original read is a 409 the member did
 * nothing to earn — and the version is PER FILE, so the one to hold is this file's
 * and never the skill's.
 */
export async function saveSkill(
  workspace: Workspace,
  input: { name: string; path?: string; content: string; modifiedAt?: string },
): Promise<SkillFile> {
  const res = await fetch("/api/skills", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: workspace.t,
      subs_acc_id: workspace.s,
      role: workspace.r,
      name: input.name,
      ...(input.path ? { path: input.path } : {}),
      content: input.content,
      ...(input.modifiedAt ? { modifiedAt: input.modifiedAt } : {}),
    }),
  });
  if (!res.ok) {
    const code = await errorCode(res);
    throw new Error(
      code === "skill_conflict"
        ? input.modifiedAt
          ? "skill_changed"
          : "skill_name_taken"
        : code,
    );
  }
  return (await res.json()).file as SkillFile;
}

export async function deleteSkill(workspace: Workspace, name: string): Promise<void> {
  const res = await fetch(`/api/skills?${skillsQuery(workspace, { name })}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

/**
 * What a new skill starts as: the two keys the harness requires, and nothing else.
 *
 * Two because those are the two that have to be there, not because a third would be
 * refused — it would not. picoclaw SHIPS skills carrying `metadata:` and `homepage:`,
 * so its loader plainly reads them (backend FR-4); the two-key rule belongs to its
 * EVOLUTION validator, which governs what an agent may write about itself. The seed
 * stays minimal so the member fills a description in rather than deleting a guess.
 */
export function seedSkill(name: string): string {
  return `---\nname: ${name}\ndescription: \n---\n\n`;
}

/**
 * Why a write of a `SKILL.md` would be refused, or null when it would not.
 *
 * ONLY THE SKILL ITSELF. A supporting file is a template, a script or a note and is
 * held to no grammar at all — the proxy validates frontmatter only when the path it
 * writes is `SKILL.md` (backend FR-5), so running these checks over a template would
 * refuse every file a skill exists to carry.
 *
 * A MIRROR OF `validateMemberSkillDoc`, not a second opinion. The proxy is the gate;
 * this exists so the member is told before a round trip, and it is deliberately not
 * stricter than the Go it copies — a rule only this side enforced would be a refusal
 * the member could not explain and the server would have accepted.
 *
 * The reasons are keys rather than sentences so the wording stays in the dictionaries,
 * the same split `errorCode` makes for the server's own refusals.
 */
export type SkillProblem =
  /** Not the proxy's `skillNameRe`. */
  | "name"
  /** No `---` block at all, so the harness reads no metadata and skips the skill. */
  | "frontmatter"
  /** `name` or `description` present but blank. */
  | "empty"
  /** The declared name is not the directory's, so the harness would file it elsewhere. */
  | "mismatch";

export function skillProblem(name: string, content: string): SkillProblem | null {
  if (!SKILL_NAME_RE.test(name)) return "name";
  const { frontmatter } = split(content);
  if (frontmatter === null) return "frontmatter";

  let declared: string | null = null;
  let description: string | null = null;
  for (const row of frontmatter) {
    // NO CHECK ON THE OTHER KEYS, and an earlier version of this file had one. The Go
    // reader keeps `name` and `description`, skips every other line — including a line
    // with no colon at all — and has to: picoclaw ships skills carrying `metadata:`
    // and `homepage:` (backend FR-4). Refusing a third key here stopped a member
    // saving any edit to the skills they were seeded with, and the server would have
    // accepted every one of those writes.
    if (row.key === "name") declared = row.value;
    else if (row.key === "description") description = row.value;
  }
  // Compared as read, with no further trimming: the Go reader unquotes and stops
  // there, so a name that only matches once this side trims it is one the proxy
  // would refuse — and refusing it here says why, a round trip earlier.
  if (!declared || !description) return "empty";
  if (declared !== name) return "mismatch";
  return null;
}
