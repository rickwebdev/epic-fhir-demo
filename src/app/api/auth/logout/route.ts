import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  session.destroy();

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("epic_fhir_session");

  return response;
}

