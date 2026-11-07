// Ports: one board can serve up to MAX_PORTS pots, each with its own soil
// probe and pump relay. A pot is connected to a specific port of a board
// (DevicePotMapping.port); each port holds at most one pot.

export const MAX_PORTS = 6;

type PortLink = { potId: string; port: number };

/**
 * Which pot a reading belongs to.
 * - With a port: the pot connected to that port (null = port not connected).
 * - Without one (older single-pot firmware): the board's only connected pot.
 * A device that isn't connected is never linked automatically — "Disconnect"
 * in the app must stick.
 */
export function pickPotForReading({ links, port }: { links: PortLink[]; port?: number }): string | null {
  if (port !== undefined) return links.find((link) => link.port === port)?.potId ?? null;
  return links.length === 1 ? links[0].potId : null;
}

/** Lowest free port on a board, or null when every port is in use. */
export function firstFreePort(usedPorts: number[], portCount: number): number | null {
  const used = new Set(usedPorts);
  for (let port = 1; port <= Math.min(Math.max(portCount, 1), MAX_PORTS); port++) if (!used.has(port)) return port;
  return null;
}

/** Firmware 2.9+ takes its port count from the app, so ports can be added there. */
export function supportsRemotePorts(firmware: string | null | undefined) {
  const m = firmware?.match(/(\d+)\.(\d+)/);
  return !!m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 9));
}
