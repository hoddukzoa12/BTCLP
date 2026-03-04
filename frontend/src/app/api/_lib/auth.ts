import { NextRequest } from "next/server";
import { getPrivyClient } from "./privyClient";
import * as jose from "jose";

export interface AuthResult {
  userId: string;
  token: string;
}

/**
 * Verify Privy auth token from the Authorization header.
 * Returns userId and token if valid, null otherwise.
 *
 * Uses a two-phase approach:
 * 1. Try Privy SDK's verifyAuthToken (fastest, uses cached key)
 * 2. If that fails with "signature verification failed", fall back to
 *    manual jose verification with relaxed options (handles SDK version
 *    mismatches between react-auth and server-auth)
 */
export async function verifyAuth(
  req: NextRequest
): Promise<AuthResult | null> {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      console.warn("[verifyAuth] No Bearer token in Authorization header");
      return null;
    }

    // Debug: decode token header + payload
    const parts = token.split(".");
    if (parts.length === 3) {
      try {
        const headerJson = Buffer.from(parts[0], "base64url").toString("utf8");
        const header_decoded = JSON.parse(headerJson);
        console.log("[verifyAuth] Token header:", JSON.stringify(header_decoded));

        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
        const payload = JSON.parse(payloadJson);
        console.log("[verifyAuth] Token claims:", JSON.stringify({
          iss: payload.iss,
          aud: payload.aud,
          sub: payload.sub,
          exp: payload.exp,
          iat: payload.iat,
          sid: payload.sid,
        }));
        console.log("[verifyAuth] Expected aud:", process.env.NEXT_PUBLIC_PRIVY_APP_ID);
        if (payload.exp && payload.exp < Date.now() / 1000) {
          console.error("[verifyAuth] Token is EXPIRED! exp:", payload.exp, "now:", Math.floor(Date.now() / 1000));
        }
      } catch {
        console.warn("[verifyAuth] Could not decode token header/payload");
      }
    }

    const privy = getPrivyClient();
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

    // ── Phase 1: Try Privy SDK's verifyAuthToken ──
    try {
      const claims = await privy.verifyAuthToken(token);
      console.log("[verifyAuth] SDK verification succeeded, userId:", claims.userId);
      return { userId: claims.userId, token };
    } catch (sdkErr) {
      const sdkMsg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      console.warn("[verifyAuth] SDK verification failed:", sdkMsg);

      // ── Phase 2: Manual jose verification (fallback) ──
      if (sdkMsg.includes("signature verification failed") || sdkMsg.includes("JWS")) {
        console.log("[verifyAuth] Attempting manual jose fallback...");
        try {
          const JWKS = jose.createRemoteJWKSet(
            new URL(`https://auth.privy.io/api/v1/apps/${appId}/.well-known/jwks.json`)
          );
          const { payload } = await jose.jwtVerify(token, JWKS, {
            issuer: "privy.io",
            audience: appId,
          });
          const userId = payload.sub as string;
          console.log("[verifyAuth] jose fallback succeeded, userId:", userId);
          return { userId, token };
        } catch (joseErr) {
          const joseMsg = joseErr instanceof Error ? joseErr.message : String(joseErr);
          console.error("[verifyAuth] jose fallback also failed:", joseMsg);
        }
      }
    }

    return null;
  } catch (err) {
    console.error("[verifyAuth] Unexpected error:", err);
    return null;
  }
}
