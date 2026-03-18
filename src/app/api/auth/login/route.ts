import { NextResponse } from "next/server";

export async function GET() {
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.EPIC_CLIENT_ID as string,
    redirect_uri: process.env.EPIC_REDIRECT_URI as string,
    scope:
      "openid fhirUser launch/patient patient/Patient.read patient/Practitioner.read patient/Appointment.read patient/Appointment.write patient/Observation.read patient/MedicationRequest.read",
    state,
    aud: process.env.EPIC_FHIR_BASE as string,
  });

  const response = NextResponse.redirect(
    `${process.env.EPIC_AUTH_URL}?${params.toString()}`
  );

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    maxAge: 300,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

