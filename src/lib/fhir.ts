import { EpicSessionData } from "./session";

export async function fhirFetch(path: string, accessToken: string) {
  const res = await fetch(`${process.env.EPIC_FHIR_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/fhir+json",
    },
  });

  if (!res.ok) {
    throw new Error(`FHIR error: ${res.status}`);
  }

  return res.json();
}

