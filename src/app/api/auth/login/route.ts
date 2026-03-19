import { NextResponse } from "next/server";

// Prevent Vercel/Next caching so the authorize URL always matches current env + code.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function base64UrlEncode(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export async function GET(request: Request) {
  const missing = [
    "EPIC_CLIENT_ID",
    "EPIC_REDIRECT_URI",
    "EPIC_FHIR_BASE",
    "EPIC_AUTH_URL",
  ].filter((k) => !process.env[k]);

  if (missing.length) {
    return NextResponse.json(
      {
        error: "Missing required environment variables",
        missing,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const state = crypto.randomUUID();

  // PKCE (required for public clients)
  const codeVerifier = base64UrlEncode(
    crypto.getRandomValues(new Uint8Array(32))
  );
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));

  // Standalone SMART scope set.
  // Note: because we request `patient/*.read` scopes, Epic typically expects `launch/patient`
  // to establish the correct launch context.
  // Keep aligned with the PRD Epic app registration scope list.
  const scope =
    // Keep this minimal for OAuth acceptance in Epic sandbox.
    // We can re-add search scopes later once auth works reliably.
    // NOTE: Epic sandbox appears to be picky about SMART scope composition.
    "fhirUser launch/patient patient/Patient.read";
  const includeOpenId = scope.split(/\s+/).includes("openid");
  const nonce = includeOpenId ? crypto.randomUUID() : undefined;

  // Epic/MyChart can be picky about encoding; encodeURIComponent ensures spaces become %20, not '+'.
  const query = [
    ["response_type", "code"],
    ["client_id", process.env.EPIC_CLIENT_ID as string],
    ["redirect_uri", process.env.EPIC_REDIRECT_URI as string],
    ["scope", scope],
    ["state", state],
    ...(nonce ? [["nonce", nonce]] : []),
    ["code_challenge", codeChallenge],
    ["code_challenge_method", "S256"],
  ]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const authorizeUrl = `${process.env.EPIC_AUTH_URL}?${query}`;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("dryRun") === "1") {
    return NextResponse.json(
      {
        authorizeUrl,
        vercel: {
          commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
          url: process.env.VERCEL_URL ?? "unknown",
          nodeEnv: process.env.NODE_ENV ?? "unknown",
        },
        params: {
          response_type: "code",
          client_id: process.env.EPIC_CLIENT_ID as string,
          redirect_uri: process.env.EPIC_REDIRECT_URI as string,
          scope,
          state,
          ...(nonce ? { nonce } : {}),
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    maxAge: 300,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  response.cookies.set("pkce_verifier", codeVerifier, {
    httpOnly: true,
    maxAge: 300,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

