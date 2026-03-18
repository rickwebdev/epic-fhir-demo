import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const tokenUrl = process.env.EPIC_TOKEN_URL ?? process.env.PIC_TOKEN_URL;

  const missing = ["EPIC_CLIENT_ID", "EPIC_REDIRECT_URI"].filter(
    (k) => !process.env[k]
  );

  if (!tokenUrl) missing.push("EPIC_TOKEN_URL");

  if (missing.length) {
    return NextResponse.json(
      { error: "Missing required environment variables", missing },
      { status: 500 }
    );
  }

  const tokenUrlFinal = tokenUrl as string;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;
  const pkceVerifier = cookieStore.get("pkce_verifier")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  cookieStore.delete("oauth_state");
  cookieStore.delete("pkce_verifier");

  if (!pkceVerifier) {
    return NextResponse.json(
      { error: "Missing PKCE verifier" },
      { status: 400 }
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.EPIC_REDIRECT_URI as string,
    client_id: process.env.EPIC_CLIENT_ID as string,
    code_verifier: pkceVerifier,
  });

  const tokenRes = await fetch(tokenUrlFinal, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!tokenRes.ok) {
    return NextResponse.json(
      {
        error: "Token exchange failed",
        status: tokenRes.status,
        tokenUrl: tokenUrlFinal,
      },
      { status: 500 }
    );
  }

  const tokenJson = await tokenRes.json();
  // Helpful debug: Epic can issue tokens with a narrower scope set than requested.
  // We intentionally do not log the raw access token.
  const accessToken = tokenJson.access_token as string | undefined;
  const decodedAccessToken = (() => {
    if (!accessToken) return null;
    const parts = String(accessToken).split(".");
    if (parts.length !== 3) return null; // opaque token
    try {
      const payloadB64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
      const pad = payloadB64.length % 4 === 0 ? "" : "=".repeat(4 - (payloadB64.length % 4));
      const json = Buffer.from(`${payloadB64}${pad}`, "base64").toString("utf8");
      return JSON.parse(json);
    } catch {
      return null;
    }
  })();
  console.log("[epic token]", {
    hasAccessToken: Boolean(accessToken),
    tokenKeys: Object.keys(tokenJson ?? {}),
    scope: tokenJson.scope ?? tokenJson.scopes ?? undefined,
    scp: tokenJson.scp ?? undefined,
    patient: tokenJson.patient ?? tokenJson.patientId ?? undefined,
    expiresIn: tokenJson.expires_in ?? undefined,
    decodedClaimsScope: decodedAccessToken?.scope ?? decodedAccessToken?.scp ?? undefined,
    decodedClaimsKeys: decodedAccessToken ? Object.keys(decodedAccessToken) : null,
  });
  const patientId =
    (tokenJson.patient as string | undefined) ||
    (tokenJson.patientId as string | undefined);
  const expiresIn = tokenJson.expires_in as number | undefined;

  if (!accessToken) {
    return NextResponse.json(
      { error: "No access token in response" },
      { status: 500 }
    );
  }

  const session = await getSession();

  session.accessToken = accessToken;
  session.patientId = patientId;
  session.scope =
    (tokenJson.scope ?? tokenJson.scopes ?? undefined) ||
    (tokenJson.scp ?? undefined) ||
    undefined;
  session.scp = tokenJson.scp ?? undefined;
  session.expiresAt = expiresIn
    ? Math.floor(Date.now() / 1000) + expiresIn
    : undefined;

  await session.save();

  return NextResponse.redirect(new URL("/dashboard", request.url));
}

