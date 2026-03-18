import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth_state")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  cookieStore.delete("oauth_state");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.EPIC_REDIRECT_URI as string,
    client_id: process.env.EPIC_CLIENT_ID as string,
  });

  const tokenRes = await fetch(process.env.EPIC_TOKEN_URL as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: "Token exchange failed", status: tokenRes.status },
      { status: 500 }
    );
  }

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string | undefined;
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
  session.expiresAt = expiresIn
    ? Math.floor(Date.now() / 1000) + expiresIn
    : undefined;

  await session.save();

  return NextResponse.redirect(new URL("/providers", request.url));
}

