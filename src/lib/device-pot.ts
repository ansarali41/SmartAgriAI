// Which pot a device reading belongs to when the payload doesn't name one:
// the single pot this device is connected to (DevicePotMapping), so a
// one-sensor-per-pot setup needs no pot IDs in its firmware. A device that
// isn't connected to a pot is never linked automatically — "Disconnect" in
// the app must stick. Returns null when there's no single connected pot.
export function pickPotForReading({ mappedPotIds }: { mappedPotIds: string[] }): string | null {
  return mappedPotIds.length === 1 ? mappedPotIds[0] : null;
}
