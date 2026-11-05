import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Replaces the Express `requireAuth` middleware. Call at the top of a
 * protected route handler. Returns the userId, or a 401 NextResponse to
 * short-circuit. Usage:
 *
 *   const gate = await requireUser();
 *   if (gate instanceof NextResponse) return gate;
 *   const userId = gate;
 */
export async function requireUser(): Promise<string | NextResponse> {
  let session;
  try {
    session = await auth();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("outside a request scope")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session.user.id;
}
