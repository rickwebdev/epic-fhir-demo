import { getSession } from "@/lib/session";
import { fhirFetch } from "@/lib/fhir";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const practitionerId = searchParams.get("practitionerId");

  if (!practitionerId) {
    return Response.json({ error: "Missing practitionerId" }, { status: 400 });
  }

  const bundle = await fhirFetch(
    `/Location?practitioner=${encodeURIComponent(practitionerId)}`,
    session.accessToken
  );

  const locations =
    bundle.entry?.map((e: any) => ({
      id: e.resource.id,
      name: e.resource.name,
      address: e.resource.address,
    })) ?? [];

  return Response.json({ locations });
}

