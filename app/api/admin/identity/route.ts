import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { callerProfile } from "@/lib/callerProfile";

// The directory area's UI gate: whether this caller is staff, manager, or
// neither.
//
// `userId` is deliberately NOT in the response. The client has no use for it --
// it exists so a tenant create can name its own caller as owner, and that
// resolution happens server-side on every write. Sending it would put an
// identifier in the browser whose only purpose is to be trusted by a write, which
// is the shape of an authorization bug waiting for someone to accept it from a
// request body.
//
// Failure denies rather than throws: the rail simply does not offer the item, the
// same posture as /api/branding/can-edit.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const profile = await callerProfile(session.token);
  return NextResponse.json({
    isStaff: profile?.isStaff === true,
    isManager: profile?.isManager === true,
  });
}
