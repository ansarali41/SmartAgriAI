// Completing a device claim — shared by the pairing-code path
// (/api/devices/pairing) and the button-press path (/api/iot/pair).
import { prisma } from "@/lib/db";
import { generateDeviceKey } from "@/lib/device-key";
import { KEY_DELIVERY_TTL_MS } from "@/lib/device-pairing";

export interface ClaimTarget {
  hardwareId: string;
  userId: string;
  /** Optional: a board can be added now and placed in a garden later. */
  gardenId: string | null;
  potId?: string | null;
  name: string;
}

/** Returns an error message if the user can't claim this board into that garden/pot. */
export async function claimTargetError(target: ClaimTarget) {
  if (target.potId && !target.gardenId) return "Choose the pot's garden too";
  if (target.gardenId) {
    const garden = await prisma.garden.findFirst({ where: { id: target.gardenId, userId: target.userId }, select: { id: true } });
    if (!garden) return "Garden not found";
  }
  if (target.potId && target.gardenId) {
    const pot = await prisma.pot.findFirst({
      where: { id: target.potId, userId: target.userId, gardenId: target.gardenId },
      select: { id: true },
    });
    if (!pot) return "Pot not found in this garden";
  }
  const existing = await prisma.device.findUnique({ where: { hardwareId: target.hardwareId }, select: { userId: true } });
  if (existing && existing.userId !== target.userId) return "This board is registered to another account.";
  return null;
}

/**
 * Create the Device (or re-key the user's existing one with this hardware ID),
 * connect it to the pot and mark the pairing claimed. With deliverNow the key
 * is returned for immediate hand-over; otherwise it waits for the board.
 */
export async function completeClaim(target: ClaimTarget, { deliverNow }: { deliverNow: boolean }) {
  const { plain, hash } = generateDeviceKey();
  const now = new Date();
  const existing = await prisma.device.findUnique({ where: { hardwareId: target.hardwareId }, select: { id: true } });

  const device = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.device.update({
          where: { id: existing.id },
          data: { apiKeyHash: hash, gardenId: target.gardenId, name: target.name, lastSeenAt: null, status: "NEVER_SEEN" },
          select: { id: true, name: true, hardwareId: true },
        })
      : await tx.device.create({
          data: {
            userId: target.userId,
            gardenId: target.gardenId,
            hardwareId: target.hardwareId,
            name: target.name,
            type: "esp32_node",
            apiKeyHash: hash,
          },
          select: { id: true, name: true, hardwareId: true },
        });
    // One board serves one pot: replace any previous connection.
    await tx.devicePotMapping.deleteMany({ where: { deviceId: saved.id } });
    if (target.potId) await tx.devicePotMapping.create({ data: { deviceId: saved.id, potId: target.potId } });
    await tx.devicePairing.update({
      where: { hardwareId: target.hardwareId },
      data: {
        claimedAt: now,
        claimedByUserId: target.userId,
        deviceId: saved.id,
        pendingKey: deliverNow ? null : plain,
        keyExpiresAt: deliverNow ? null : new Date(now.getTime() + KEY_DELIVERY_TTL_MS),
        confirmRequestedAt: null,
      },
    });
    return saved;
  });

  return { device, key: plain };
}
