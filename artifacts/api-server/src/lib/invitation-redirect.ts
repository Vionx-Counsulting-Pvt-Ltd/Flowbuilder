import type { IncomingHttpHeaders } from "node:http";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";

/** Clerk needs an absolute app URL, not a path on its own accounts host. */
export function invitationRedirectUrl(req: { headers: IncomingHttpHeaders }): string {
  const host = getClerkProxyHost(req);
  if (!host || /[/\\?#@\s]/.test(host)) throw new Error("The public app address is unavailable.");
  const publicUrl = new URL(`https://${host}`);
  const originHeader = req.headers.origin;
  if (originHeader) {
    const origin = new URL(originHeader);
    if (origin.host.toLowerCase() !== publicUrl.host.toLowerCase() ||
        origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("The invitation must be sent from this app's own address.");
    }
    publicUrl.protocol = origin.protocol;
  } else {
    const forwarded = req.headers["x-forwarded-proto"];
    const protocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
    if (protocol) publicUrl.protocol = `${protocol}:`;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname);
  if (publicUrl.protocol !== "https:" && !(loopback && publicUrl.protocol === "http:")) {
    throw new Error("Invitations require a secure app address.");
  }
  return new URL("/sign-up", publicUrl).href;
}
