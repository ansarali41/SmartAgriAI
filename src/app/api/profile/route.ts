import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const user = await prisma.user.findUnique({
    where: { id: gate },
    select: {
      email: true,
      userName: true,
      createdAt: true,
      _count: { select: { gardens: true, pots: true, devices: true } },
    },
  });
  return NextResponse.json(user);
}

const schema = z
  .object({
    userName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8, "New password must be at least 8 characters").max(128).optional(),
  })
  .strict()
  .refine(
    (data) => Boolean(data.currentPassword) === Boolean(data.newPassword),
    { message: "Enter both the current and new password.", path: ["newPassword"] },
  )
  .refine(
    (data) => data.userName !== undefined || data.email !== undefined || data.newPassword !== undefined,
    { message: "Provide at least one account change." },
  );

export async function PATCH(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid account data" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: gate },
    select: { passwordHash: true, passwordSalt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (
    parsed.data.currentPassword &&
    !verifyPassword(parsed.data.currentPassword, user.passwordHash, user.passwordSalt)
  ) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  if (parsed.data.newPassword && parsed.data.newPassword === parsed.data.currentPassword) {
    return NextResponse.json({ error: "Choose a new password that's different from the current one." }, { status: 400 });
  }

  const passwordUpdate = parsed.data.newPassword
    ? hashPassword(parsed.data.newPassword)
    : undefined;

  try {
    const updated = await prisma.user.update({
      where: { id: gate },
      data: {
        ...(parsed.data.userName !== undefined ? { userName: parsed.data.userName } : {}),
        ...(parsed.data.email !== undefined
          ? { email: parsed.data.email.toLowerCase() }
          : {}),
        ...(passwordUpdate ?? {}),
      },
      select: { email: true, userName: true },
    });
    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}
