// Which pot a device reading belongs to when the payload doesn't name one.
//   1. The single pot this device is connected to (DevicePotMapping), so a
//      one-sensor-per-pot setup needs no pot IDs in its firmware.
//   2. Otherwise the garden's only active pot.
// Returns null when it's ambiguous; the caller then requires an explicit potId.
export function pickPotForReading({
  mappedPotIds,
  gardenPotIds,
}: {
  mappedPotIds: string[];
  gardenPotIds: string[];
}): string | null {
  if (mappedPotIds.length === 1) return mappedPotIds[0];
  if (mappedPotIds.length === 0 && gardenPotIds.length === 1) return gardenPotIds[0];
  return null;
}
