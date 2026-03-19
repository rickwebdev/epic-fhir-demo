/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSession } from "@/lib/session";
import { fhirFetch, fhirFetchRaw } from "@/lib/fhir";

function normalizeText(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const t = x.trim();
  return t.length ? t : undefined;
}

function extractBestPractitionerName(
  practitioner: any,
  fallback?: string
): string | undefined {
  const p = practitioner;
  const name0 = p?.name?.[0];
  const text = normalizeText(name0?.text);
  if (text) return text;

  const given0 = Array.isArray(name0?.given) ? name0.given?.[0] : name0?.given;
  const family = name0?.family;
  const combined = `${given0 ?? ""} ${family ?? ""}`.trim();
  if (combined.length) return combined;

  const familyOnly = normalizeText(family);
  if (familyOnly) return familyOnly;

  return normalizeText(fallback);
}

function extractTelecom(
  practitioner: any
): { phone?: string; email?: string } | undefined {
  const telecom: any[] = Array.isArray(practitioner?.telecom)
    ? practitioner.telecom
    : [];
  const phone = telecom.find((t) => String(t?.system ?? "") === "phone")?.value;
  const email = telecom.find((t) => String(t?.system ?? "") === "email")?.value;
  const out = { phone: normalizeText(phone), email: normalizeText(email) };
  return out.phone || out.email ? out : undefined;
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty") ?? "";
  const debug = searchParams.get("debug") === "1";

  const token = session.accessToken;

  const normalize = (s: string) => s.trim().toLowerCase();
  const requestedSpecialty = normalize(specialty);
  const sessionScope = session.scope ?? session.scp ?? undefined;

  async function providersFromPatientPractitioners(patientId: string) {
    const patientDirect = await fhirFetchRaw(
      `/Patient/${encodeURIComponent(patientId)}`,
      token
    );

    const body = patientDirect.bodyJson as any | undefined;
    const generalPractitioner = body?.generalPractitioner;

    const refs: string[] = [];
    if (Array.isArray(generalPractitioner)) {
      for (const r of generalPractitioner) {
        if (r?.reference) refs.push(String(r.reference));
      }
    } else if (generalPractitioner?.reference) {
      refs.push(String(generalPractitioner.reference));
    }

    const extractedIds: string[] = [];
    for (const ref of refs) {
      const parts = ref.split("/");
      const id = parts[parts.length - 1];
      if (id && id !== "Practitioner") extractedIds.push(id);
    }

    const uniqueIds = Array.from(new Set(extractedIds));
    const extractedPractitionerIdsCount = uniqueIds.length;

    // Additional practitioner candidates and specialty hints from CareTeam.
    // Practitioner search is forbidden in this sandbox, but direct reads work.
    const rolesByPractitionerId: Record<string, string[]> = {};

    const careTeamQueries = [
      `/CareTeam?patient=${encodeURIComponent(patientId)}`,
      `/CareTeam?subject=Patient/${encodeURIComponent(patientId)}`,
      `/CareTeam?subject=${encodeURIComponent(patientId)}`,
    ];

    const careTeamBundles: Array<{ ok: boolean; bodyJson?: any }> = [];
    for (const q of careTeamQueries) {
      try {
        const raw = await fhirFetchRaw(q, token);
        careTeamBundles.push({ ok: raw.ok, bodyJson: raw.bodyJson });
        // stop at first OK bundle
        if (raw.ok && (raw.bodyJson as any)?.entry?.length) break;
      } catch {
        // ignore and try next query
      }
    }

    const careTeamPractitionerIds: string[] = [];
    for (const b of careTeamBundles) {
      const entries = b.bodyJson?.entry;
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        const ct = entry?.resource;
        const participants = ct?.participant;
        if (!Array.isArray(participants)) continue;

        for (const part of participants) {
          const memberRef: string | undefined =
            part?.member?.reference ?? part?.member?.reference?.toString?.();
          if (!memberRef) continue;

          const parts = String(memberRef).split("/");
          const practitionerId = parts[parts.length - 1];
          if (!practitionerId || practitionerId === "Practitioner") continue;

          careTeamPractitionerIds.push(practitionerId);

          const roleText =
            part?.role?.[0]?.text ??
            part?.role?.text ??
            part?.role?.coding?.[0]?.display ??
            part?.role?.coding?.[0]?.code;
          if (typeof roleText === "string" && roleText.trim().length > 0) {
            rolesByPractitionerId[practitionerId] =
              rolesByPractitionerId[practitionerId] ?? [];
            rolesByPractitionerId[practitionerId].push(roleText);
          }
        }
      }
    }

    // Additional practitioner candidates from Appointment participants.
    // Practitioner search is often blocked in the sandbox, but Appointment search by patient
    // is typically allowed and Appointment references participants/performers.
    const appointmentPractitionerIds: string[] = [];
    try {
      const apptBundleRaw = await fhirFetchRaw(
        `/Appointment?patient=${encodeURIComponent(patientId)}&_count=20`,
        token
      );
      if (
        apptBundleRaw.ok &&
        (apptBundleRaw.bodyJson as any)?.entry?.length
      ) {
        const entries = (apptBundleRaw.bodyJson as any).entry;
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            const appt = entry?.resource;
            const participants = appt?.participant;
            if (Array.isArray(participants)) {
              for (const part of participants) {
                const ref = part?.actor?.reference;
                if (typeof ref === "string" && ref.includes("/")) {
                  const id = ref.split("/").pop();
                  if (id && id !== "Practitioner") {
                    appointmentPractitionerIds.push(id);
                  }
                }
              }
            }

            const performers = appt?.performer;
            if (Array.isArray(performers)) {
              for (const perf of performers) {
                const ref = perf?.actor?.reference;
                if (typeof ref === "string" && ref.includes("/")) {
                  const id = ref.split("/").pop();
                  if (id && id !== "Practitioner") {
                    appointmentPractitionerIds.push(id);
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore appointment extraction failures
    }

    const appointmentPractitionerIdsCount = Array.from(
      new Set(appointmentPractitionerIds)
    ).length;

    const combinedIds = Array.from(
      new Set([
        ...uniqueIds,
        ...careTeamPractitionerIds,
        ...appointmentPractitionerIds,
      ])
    );
    const candidates = combinedIds.slice(0, 10);
    const careTeamPractitionerIdsCount = Array.from(
      new Set(careTeamPractitionerIds)
    ).length;
    const candidatesCount = candidates.length;

    const results = [];
    let practitionerReadAttempts = 0;

    for (const practitionerId of candidates) {
      practitionerReadAttempts++;
      const practitionerRaw = await fhirFetchRaw(
        `/Practitioner/${encodeURIComponent(practitionerId)}`,
        token
      );
      if (!practitionerRaw.ok || !practitionerRaw.bodyJson) continue;

      const p: any = practitionerRaw.bodyJson;

      // Practitioners can represent specialty in multiple places; collect both
      // `Practitioner.specialty` and `Practitioner.qualification[].code`.
      const fromQualification: string[] = Array.isArray(p.qualification)
        ? p.qualification
            .map((q: any) => q?.code?.text)
            .filter((t: any) => typeof t === "string" && t.trim().length > 0)
        : [];

      const fromSpecialty: string[] = Array.isArray(p.specialty)
        ? p.specialty
            .map((s: any) => {
              if (typeof s?.text === "string" && s.text.trim().length > 0) {
                return s.text;
              }
              const c0 = Array.isArray(s?.coding) ? s.coding[0] : undefined;
              return (
                c0?.display ??
                (typeof c0?.code === "string" ? c0.code : undefined)
              );
            })
            .filter((t: any) => typeof t === "string" && t.trim().length > 0)
        : [];

      const providerSpecialties = Array.from(
        new Set([...fromSpecialty, ...fromQualification])
      );

      const roleHints = rolesByPractitionerId[practitionerId] ?? [];
      const combinedSpecialties = Array.from(
        new Set([...providerSpecialties, ...roleHints])
      );

      const providerSpecialty =
        combinedSpecialties[0] ?? providerSpecialties[0] ?? "General Practice";
      const specialtiesFinal =
        Array.isArray(combinedSpecialties) && combinedSpecialties.length > 0
          ? combinedSpecialties
          : [providerSpecialty];

      const providerNpi =
        p.identifier?.find((i: any) =>
          String(i.system ?? "").includes("npi")
        )?.value ?? undefined;

      const providerName = extractBestPractitionerName(p);
      const telecom = extractTelecom(p);
      const nameDebug = debug
        ? {
            nameText: normalizeText(p?.name?.[0]?.text),
            given: Array.isArray(p?.name?.[0]?.given) ? p.name[0].given : undefined,
            family: normalizeText(p?.name?.[0]?.family),
            telecomSystems: Array.isArray(p?.telecom)
              ? p.telecom
                  .map((t: any) => normalizeText(t?.system))
                  .filter(Boolean)
              : [],
          }
        : undefined;

      // Best-effort location join. Some sandboxes forbid Location searches;
      // we keep this optional so Phase 1 still works.
      let locationName: string | undefined = undefined;
      let locationAddress: string | undefined = undefined;
      try {
        const locBundle = await fhirFetchRaw(
          `/Location?practitioner=${encodeURIComponent(practitionerId)}`,
          token
        );
        const loc0 = (locBundle.bodyJson as any)?.entry?.[0]?.resource;
        if (loc0) {
          locationName = loc0.name ?? undefined;
          const addr = loc0.address?.[0];
          if (addr) {
            const parts = [
              addr.line?.[0],
              addr.city,
              addr.state,
              addr.postalCode,
            ].filter(Boolean);
            locationAddress = parts.join(", ");
          }
        }
      } catch {
        // ignore location lookup failures
      }

      results.push({
        id: p.id,
        name: providerName,
        specialty: providerSpecialty,
        specialties: specialtiesFinal,
        npi: providerNpi,
        locationName,
        locationAddress,
        phone: telecom?.phone,
        email: telecom?.email,
        ...(nameDebug ? { nameDebug } : {}),
      });
    }

    const availableSpecialties = Array.from(
      new Set(
        results.flatMap((r: any) =>
          Array.isArray(r.specialties)
            ? r.specialties
            : [
                typeof r.specialties === "string" && r.specialties
                  ? r.specialties
                  : r.specialty,
              ]
        )
      )
    ).filter((s: any) => typeof s === "string" && s.trim().length > 0);

    // Apply specialty filter strictly.
    // If nothing matches the dropdown, return an empty list so the UI reflects it.
    if (!requestedSpecialty) {
      return {
        providers: results,
        availableSpecialties,
        source: "fallback",
        tokenScope: sessionScope,
        debug: {
          patientId,
          extractedPractitionerIdsCount,
          careTeamPractitionerIdsCount,
          appointmentPractitionerIdsCount,
          candidatesCount,
          practitionerReadAttempts,
        },
        matchedSpecialty: true,
      };
    }

    const filtered = results.filter((r: any) =>
      Array.isArray(r.specialties)
        ? r.specialties
            .map((s: any) => normalize(String(s ?? "")))
            .some((s: string) => s.includes(requestedSpecialty))
        : normalize(String(r.specialty ?? "")).includes(requestedSpecialty)
    );
    const providers = filtered;

    return {
      providers,
      availableSpecialties,
      tokenScope: sessionScope,
      source: "fallback",
      debug: {
        patientId,
        extractedPractitionerIdsCount,
        careTeamPractitionerIdsCount,
        appointmentPractitionerIdsCount,
        candidatesCount,
        practitionerReadAttempts,
      },
      matchedSpecialty: filtered.length > 0,
    };
  }

  // Phase 1: Epic seems to forbid Practitioner *search* in this sandbox, but allows
  // Practitioner direct reads (Practitioner/{id}) derived from the logged-in patient.
  //
  // Specialty search is exposed on PractitionerRole (token search param `specialty`),
  // not on Practitioner search params (as confirmed by Epic's CapabilityStatement).
  try {
    // PractitionerRole.specialty is a `token` search param and Epic expects a code system
    // in many cases. Start by trying the plain specialty string, then fall back to
    // a best-effort URN system if Epic complains.
    const roleSearch = async (specialtyToken: string) => {
      return fhirFetch(
        `/PractitionerRole?specialty=${encodeURIComponent(specialtyToken)}&_count=20`,
        token
      );
    };

    let bundle: any;
    try {
      bundle = await roleSearch(specialty);
    } catch (innerErr) {
      const innerMsg =
        innerErr instanceof Error ? innerErr.message : "Unknown error";
      // Best-effort specialty code system from Epic error payloads.
      const fallbackSystem = "urn:oid:1.2.840.114350.1.13.0.1.7.2.657369";
      if (innerMsg.toLowerCase().includes("code system")) {
        bundle = await roleSearch(`${fallbackSystem}|${specialty}`);
      } else {
        throw innerErr;
      }
    }

    const entries = Array.isArray(bundle.entry) ? bundle.entry : [];

    const roles = entries
      .map((e: any) => e?.resource)
      .filter(Boolean)
      .slice(0, 20);

    const practitionerIds = Array.from(
      new Set(
        roles
          .map((r: any) => r?.practitioner?.reference)
          .filter(Boolean)
          .map((ref: string) => ref.split("/").pop())
          .filter(Boolean)
      )
    );

    const locationIds = Array.from(
      new Set(
        roles
          .flatMap((r: any) => (Array.isArray(r?.location) ? r.location : []))
          .map((loc: any) => loc?.reference)
          .filter(Boolean)
          .map((ref: string) => ref.split("/").pop())
          .filter(Boolean)
      )
    );

    const practitionerById: Record<string, any> = {};
    const practitionerIdsTyped = practitionerIds as string[];
    await Promise.all(
      practitionerIdsTyped.map(async (pid) => {
        const raw = await fhirFetchRaw(`/Practitioner/${pid}`, token);
        if (raw.ok) practitionerById[pid] = raw.bodyJson as any;
      })
    );

    const locationById: Record<string, any> = {};
    const locationIdsTyped = locationIds as string[];
    await Promise.all(
      locationIdsTyped.map(async (lid) => {
        const raw = await fhirFetchRaw(`/Location/${lid}`, token);
        if (raw.ok) locationById[lid] = raw.bodyJson as any;
      })
    );

    const providers = roles.map((r: any) => {
      const practitionerRef: string | undefined = r?.practitioner?.reference;
      const practitionerId = practitionerRef
        ? practitionerRef.split("/").pop()
        : undefined;

      const locRef = Array.isArray(r?.location) ? r.location?.[0]?.reference : undefined;
      const locId = locRef ? locRef.split("/").pop() : undefined;

      const p = practitionerId ? practitionerById[practitionerId] : undefined;
      const loc = locId ? locationById[locId] : undefined;

      const providerName = extractBestPractitionerName(
        p,
        r?.practitioner?.display
      );
      const telecom = extractTelecom(p);
      const nameDebug = debug
        ? {
            roleDisplay: normalizeText(r?.practitioner?.display),
            nameText: normalizeText(p?.name?.[0]?.text),
            given: Array.isArray(p?.name?.[0]?.given) ? p.name[0].given : undefined,
            family: normalizeText(p?.name?.[0]?.family),
            telecomSystems: Array.isArray(p?.telecom)
              ? p.telecom
                  .map((t: any) => normalizeText(t?.system))
                  .filter(Boolean)
              : [],
          }
        : undefined;

      const roleSpecialtyCandidates: string[] = [];
      if (Array.isArray(r?.code) && r.code.length > 0) {
        for (const c of r.code) {
          if (c?.text) roleSpecialtyCandidates.push(String(c.text));
          if (Array.isArray(c?.coding)) {
            for (const cd of c.coding) {
              if (cd?.display) roleSpecialtyCandidates.push(String(cd.display));
            }
          }
        }
      }

      const providerSpecialty =
        roleSpecialtyCandidates[0] ?? "General Practice";

      const providerNpi =
        p?.identifier?.find((i: any) =>
          String(i.system ?? "").includes("npi")
        )?.value ?? undefined;

      const locationName = loc?.name ?? undefined;
      const locationAddressObj = loc?.address?.[0];
      const locationAddress = locationAddressObj
        ? [
            locationAddressObj.line?.[0],
            locationAddressObj.city,
            locationAddressObj.state,
            locationAddressObj.postalCode,
          ]
            .filter(Boolean)
            .join(", ")
        : undefined;

      return {
        id: p?.id ?? practitionerId ?? undefined,
        name: providerName,
        specialty: providerSpecialty,
        npi: providerNpi,
        locationName,
        locationAddress,
        phone: telecom?.phone,
        email: telecom?.email,
        ...(nameDebug ? { nameDebug } : {}),
      };
    });

    return Response.json({
      source: "search",
      providers: providers.filter((p: any) => p?.id),
      availableSpecialties: Array.from(
        new Set(providers.map((p: any) => p.specialty).filter(Boolean))
      ),
      tokenScope: sessionScope,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // If Epic rejects Practitioner search due to unsupported params (e.g. SPECIALTY)
    // or requires different query params, fall back to patient-derived reads.
    const shouldFallback =
      msg.includes("403") ||
      msg.includes("401") ||
      msg.includes("400") ||
      msg.includes("Unknown parameter") ||
      msg.includes("Either name, family, or identifier is a required parameter");

    if (!shouldFallback) {
      return Response.json(
        {
          error: "FHIR practitioner search failed",
          message: msg,
        },
        { status: 500 }
      );
    }

    const patientId = session.patientId;
    if (!patientId) {
      return Response.json({ error: "Missing patientId" }, { status: 400 });
    }

    try {
      const out = await providersFromPatientPractitioners(patientId);
      return Response.json({
        ...out,
        source: out?.source ?? "fallback",
        tokenScope: sessionScope,
      });
    } catch (fallbackErr) {
      const fallbackMsg =
        fallbackErr instanceof Error ? fallbackErr.message : "Unknown error";
      return Response.json(
        {
          error: "FHIR fallback failed",
          message: fallbackMsg,
        },
        { status: 500 }
      );
    }
  }
}

