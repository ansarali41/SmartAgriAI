// Pot serial numbers: POT-1, POT-2, … per user, assigned by the server.
import type { Prisma } from "@prisma/client";

export const potCode = (number: number) => `POT-${number}`;

/**
 * The next serial for this user. Call inside a transaction: the advisory lock
 * makes concurrent creates for the same user wait their turn, so two pots
 * never get the same number.
 */
export async function nextPotNumber(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pot-number:${userId}`}))`;
  const max = await tx.pot.aggregate({ where: { userId }, _max: { number: true } });
  return (max._max.number ?? 0) + 1;
}
