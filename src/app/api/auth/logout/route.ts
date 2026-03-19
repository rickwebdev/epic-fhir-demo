import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  session.destroy();

  // Use 303 so POST /api/auth/logout redirects as GET /logout.
  const response = NextResponse.redirect(new URL("/logout", request.url), 303);
  response.cookies.delete("epic_fhir_session");

  return response;
}

