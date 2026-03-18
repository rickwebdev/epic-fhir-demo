import { IronSession, ironSession } from "iron-session";
import { cookies } from "next/headers";

export interface EpicSessionData {
  accessToken?: string;
  patientId?: string;
  expiresAt?: number;
}

const sessionOptions = {
  cookieName: "epic_fhir_session",
  password: process.env.SESSION_SECRET as string,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

export async function getSession(): Promise<IronSession<EpicSessionData>> {
  const cookieStore = await cookies();
  return ironSession<EpicSessionData>(cookieStore, sessionOptions);
}

