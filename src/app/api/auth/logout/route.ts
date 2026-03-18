import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  session.destroy();

  const response = NextResponse.redirect("/");
  response.cookies.delete("epic_fhir_session");

  return response;
}

