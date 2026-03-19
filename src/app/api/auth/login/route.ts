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

  const { searchParams } = new URL(request.url);
  const variant = searchParams.get("variant") ?? "minimal";

  // Epic sandbox rejects different authorize requests with a generic "request is invalid".
  // This lets us toggle key OAuth parameters without repeated redeploys.
  const scopeByVariant: Record<string, string> = {
    minimal: "fhirUser launch/patient patient/Patient.read",
    minimal_aud: "fhirUser launch/patient patient/Patient.read",
    openid: "openid fhirUser launch/patient patient/Patient.read",
    openid_aud: "openid fhirUser launch/patient patient/Patient.read",
    openid_launch_only: "openid fhirUser launch/patient",
    openid_launch_only_aud: "openid fhirUser launch/patient",
    patient_only: "patient/Patient.read",
    launch_only: "launch/patient",
    launch_only_aud: "launch/patient",
  };

  const scope = scopeByVariant[variant] ?? scopeByVariant.minimal;
  const includeOpenId = scope.split(/\s+/).includes("openid");
  const nonce = includeOpenId ? crypto.randomUUID() : undefined;
  const includeAud =
    variant === "minimal_aud" ||
    variant === "openid_aud" ||
    variant === "openid_launch_only_aud" ||
    variant === "launch_only_aud";

  // Epic/MyChart can be picky about encoding; encodeURIComponent ensures spaces become %20, not '+'.
  const query = [
    ["response_type", "code"],
    ["client_id", process.env.EPIC_CLIENT_ID as string],
    ["redirect_uri", process.env.EPIC_REDIRECT_URI as string],
    ["scope", scope],
    ["state", state],
    ...(nonce ? [["nonce", nonce]] : []),
    ...(includeAud ? [["aud", process.env.EPIC_FHIR_BASE as string]] : []),
    ["code_challenge", codeChallenge],
    ["code_challenge_method", "S256"],
  ]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const authorizeUrl = `${process.env.EPIC_AUTH_URL}?${query}`;

  if (searchParams.get("dryRun") === "1") {
    return NextResponse.json(
      {
        authorizeUrl,
        debug: {
          version: "oauth-epic-variant-1",
          variant,
          includeOpenId,
          includeAud,
        },
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
          ...(includeAud ? { aud: process.env.EPIC_FHIR_BASE as string } : {}),
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

