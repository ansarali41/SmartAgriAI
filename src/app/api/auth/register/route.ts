// TASK: Auth — account registration.
// WHAT: Creates a User (scrypt-hashed password) + their default IrrigationConfig.
//       Login itself is handled by Auth.js (src/auth.ts) Credentials provider.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { defaultIrrigation } from "@/lib/defaults";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  // Same rule as changing the password in Settings.
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  userName: z.string().trim().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { email, password, userName } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }

    const { passwordHash, passwordSalt } = hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        passwordSalt,
        userName: userName || normalizedEmail.split("@")[0],
        irrigationConfig: {
          create: {
            thresholdPercent: defaultIrrigation.threshold,
            manualOverride: defaultIrrigation.manualOverride,
            currentStatus: defaultIrrigation.status,
          },
        },
      },
      select: { id: true, email: true, userName: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Failed to register" },
      { status: 500 },
    );
  }
}
