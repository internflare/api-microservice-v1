import { fromNodeHeaders } from "better-auth/node";
import type { IncomingHttpHeaders } from "node:http";
import { getAuth } from "../auth.js";

// Keep Better Auth's session lookup behind the model layer for controllers.
export async function findSession(headers: IncomingHttpHeaders) {
  return getAuth().api.getSession({
    headers: fromNodeHeaders(headers),
  });
}
