import { NextRequest } from "next/server";
import { getPrivyClient } from "./privyClient";

export interface AuthResult {
  userId: string;
  token: string;
}

/**
 * Verify Privy auth token from the Authorization header.
 * Returns userId and token if valid, null otherwise.
 */
export async function verifyAuth(
  req: NextRequest
): Promise<AuthResult | null> {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return null;

    const privy = getPrivyClient();
    const claims = await privy.verifyAuthToken(token);

    return {
      userId: claims.userId,
      token,
    };
  } catch {
    return null;
  }
}
