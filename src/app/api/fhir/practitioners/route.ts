import { getSession } from "@/lib/session";
import { fhirFetch } from "@/lib/fhir";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty") ?? "";

  const bundle = await fhirFetch(
    `/Practitioner?specialty=${encodeURIComponent(specialty)}&_count=20`,
    session.accessToken
  );

  const providers =
    bundle.entry?.map((e: any) => ({
      id: e.resource.id,
      name: `${e.resource.name?.[0]?.given?.[0] ?? ""} ${
        e.resource.name?.[0]?.family ?? ""
      }`.trim(),
      specialty:
        e.resource.qualification?.[0]?.code?.text ?? "General Practice",
      npi: e.resource.identifier?.find((i: any) =>
        String(i.system ?? "").includes("npi")
      )?.value,
    })) ?? [];

  return Response.json({ providers });
}

