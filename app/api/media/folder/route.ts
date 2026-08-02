import { NextRequest, NextResponse } from "next/server";
import { proxyMediaWrite } from "@/lib/mediaFolderProxy";

// Create a folder in the uploads tree.
export async function POST(req: NextRequest): Promise<NextResponse> {
  return proxyMediaWrite(req, "POST", "/v1/media/folder");
}

// Delete a folder AND its contents. Destructive and recursive — the confirmation
// naming the file count is the interface's job, before this is ever called.
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return proxyMediaWrite(req, "DELETE", "/v1/media/folder");
}
