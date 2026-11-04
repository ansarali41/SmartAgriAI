// TASK: The address boards should use to reach this server. A phone or ESP32
// can't use "localhost", so list this machine's LAN addresses for the
// "Add device" guide.
import os from "node:os";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";

export async function GET(req: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const url = new URL(req.url);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const suffix = ["80", "443"].includes(port) ? "" : `:${port}`;
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((net): net is os.NetworkInterfaceInfo => Boolean(net && net.family === "IPv4" && !net.internal))
    .map((net) => `http://${net.address}${suffix}`);
  // If the app is already opened via a LAN/public host, that's the best answer.
  const current = ["localhost", "127.0.0.1"].includes(url.hostname) ? null : `${url.protocol}//${url.host}`;
  return NextResponse.json({ serverUrls: [...new Set([...(current ? [current] : []), ...addresses])] });
}
