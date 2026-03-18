/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSession } from "@/lib/session";
import { fhirFetchRaw } from "@/lib/fhir";

function normalizeText(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  return t.length ? t : undefined;
}

function extractCodeText(code: any): string | undefined {
  return (
    normalizeText(code?.text) ||
    normalizeText(code?.coding?.[0]?.display) ||
    normalizeText(code?.coding?.[0]?.code)
  );
}

function formatReferenceRange(rr: any): string | undefined {
  const low = rr?.low?.value;
  const high = rr?.high?.value;
  const lowUnit = rr?.low?.unit ?? rr?.low?.code ?? "";
  const highUnit = rr?.high?.unit ?? rr?.high?.code ?? "";

  const asVal = (v: any, unit: any) => {
    if (v === null || v === undefined || v === "") return "";
    const u = typeof unit === "string" && unit.trim() ? ` ${unit}` : "";
    return `${v}${u}`.trim();
  };

  const lowStr = asVal(low, lowUnit);
  const highStr = asVal(high, highUnit);

  if (lowStr && highStr) return `${lowStr} - ${highStr}`.trim();
  if (lowStr) return `>= ${lowStr}`;
  if (highStr) return `<= ${highStr}`;
  const text = normalizeText(rr?.text);
  return text;
}

function extractNpi(practitioner: any): string | undefined {
  const idents: any[] = Array.isArray(practitioner?.identifier)
    ? practitioner.identifier
    : [];
  const npi = idents.find((i) => String(i?.system ?? "").toLowerCase().includes("npi"))?.value;
  return normalizeText(npi);
}

function extractProviderName(practitioner: any): string | undefined {
  const name0 = practitioner?.name?.[0];
  // Some Epic payloads include a pre-computed full name in `text`.
  const text = normalizeText(name0?.text);
  if (text) return text;
  const given = name0?.given?.[0];
  const family = name0?.family;
  const name = `${given ?? ""} ${family ?? ""}`.trim();
  if (name.length) return name;

  // Last resort: display NPI instead of raw FHIR IDs.
  return extractNpi(practitioner);
}

function extractLocationDisplay(location: any): string | undefined {
  const name = normalizeText(location?.name);
  if (name) return name;

  const addr0 = Array.isArray(location?.address)
    ? location.address[0]
    : undefined;
  const lines = addr0?.line;
  const line0 =
    Array.isArray(lines) && typeof lines?.[0] === "string"
      ? lines[0]
      : undefined;

  const parts = [line0, addr0?.city, addr0?.state, addr0?.postalCode].filter(
    (p) => typeof p === "string" && p.trim().length > 0
  ) as string[];

  return parts.length ? parts.join(", ") : undefined;
}

function extractProviderSpecialties(practitioner: any): string[] {
  const out = new Set<string>();
  const specialties: any[] = Array.isArray(practitioner?.specialty)
    ? practitioner.specialty
    : [];
  for (const s of specialties) {
    const text = normalizeText(s?.text);
    if (text) out.add(text);
    const cd0 = Array.isArray(s?.coding) ? s.coding[0] : undefined;
    const display = normalizeText(cd0?.display);
    const code = normalizeText(cd0?.code);
    if (display) out.add(display);
    if (code) out.add(code);
  }

  const quals: any[] = Array.isArray(practitioner?.qualification)
    ? practitioner.qualification
    : [];
  for (const q of quals) {
    const codeText = normalizeText(q?.code?.text);
    if (codeText) out.add(codeText);
  }
  return Array.from(out);
}

function refToId(ref: unknown): string | undefined {
  if (typeof ref !== "string") return undefined;
  if (!ref.includes("/")) return undefined;
  const id = ref.split("/").pop();
  return id && id !== "Practitioner" ? id : undefined;
}

type MedicationView = {
  id: string;
  medication?: string;
  status?: string;
  authoredOn?: string;
  dosage?: string;
};

type CareTeamView = {
  id: string;
  role?: string;
  providerId?: string;
  providerName?: string;
  npi?: string;
  locationName?: string;
  specialties?: string[];
};

function collectReferenceIds(resources: any, resourceType: string): string[] {
  const ids = new Set<string>();

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedResourceType = escapeRegExp(resourceType);
  const idFromString = (s: string): string | undefined => {
    // Accept either ".../ResourceType/{id}" or "ResourceType/{id}".
    const re = new RegExp(
      String.raw`(?:\/)?${escapedResourceType}\/([^\/\?\#\s]+)`,
      "i"
    );
    const m = s.match(re);
    return m?.[1] ? String(m[1]) : undefined;
  };

  const visit = (x: any, depth: number) => {
    // Allow deeper traversal because Epic's Appointment payload can nest references.
    if (depth > 25) return;
    if (!x) return;
    if (Array.isArray(x)) {
      for (const item of x) visit(item, depth + 1);
      return;
    }
    if (typeof x === "string") {
      const maybeId = idFromString(x);
      if (maybeId) ids.add(maybeId);
      return;
    }
    if (typeof x !== "object") return;

    for (const [k, v] of Object.entries(x)) {
      // Fast path: standard FHIR `reference` field.
      if (k === "reference" && typeof v === "string") {
        const maybeId = idFromString(v);
        if (maybeId) ids.add(maybeId);
        continue;
      }
      visit(v, depth + 1);
    }
  };

  visit(resources, 0);
  return Array.from(ids);
}

function observationToLabView(o: any): { id: string; code?: string; effective?: string; value?: string; referenceRange?: string } | undefined {
  const id = String(o?.id ?? "");
  if (!id) return undefined;
  const code = extractCodeText(o?.code);
  const effective =
    normalizeText(o?.effectiveDateTime) || normalizeText(o?.effectivePeriod?.start);

  const valueQuantity = o?.valueQuantity;
  const value =
    valueQuantity?.value !== undefined
      ? `${valueQuantity.value} ${valueQuantity.unit ?? valueQuantity.code ?? ""}`.trim()
      : normalizeText(o?.valueString) ||
        normalizeText(o?.valueCodeableConcept?.text) ||
        normalizeText(o?.valueCode);

  const referenceRange = Array.isArray(o?.referenceRange) ? o.referenceRange?.[0] : undefined;
  const referenceRangeStr = referenceRange ? formatReferenceRange(referenceRange) : undefined;

  return { id, code, effective, value, referenceRange: referenceRangeStr };
}

function medicationRequestToMedicationView(m: any): MedicationView | undefined {
  const id = String(m?.id ?? "");
  if (!id) return undefined;
  const medication = extractCodeText(m?.medicationCodeableConcept);
  const status = normalizeText(m?.status);
  const authoredOn = normalizeText(m?.authoredOn);
  const dosage = (() => {
    const di = Array.isArray(m?.dosageInstruction) ? m.dosageInstruction?.[0] : undefined;
    return normalizeText(di?.text);
  })();
  return { id, medication, status, authoredOn, dosage };
}

export async function GET() {
  const session = await getSession();
  if (!session.accessToken || !session.patientId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = session.accessToken;
  const patientId = session.patientId;
  const tokenScope = session.scope ?? session.scp ?? undefined;

  const fallbackUsed: string[] = [];
  let practitionerDirectReadCount = 0;
  let locationDirectReadCount = 0;
  let observationDirectReadAttempted = 0;
  let observationDirectReadOk = 0;
  let medicationRequestDirectReadAttempted = 0;
  let medicationRequestDirectReadOk = 0;
  let medicationDirectReadAttempted = 0;
  let medicationDirectReadOk = 0;
  let observationDirectReadFromPatientAttempted = 0;
  let observationDirectReadFromPatientOk = 0;

  async function tryRaw(path: string) {
    return fhirFetchRaw(path, token);
  }

  // 1) Patient identity
  const patientRaw = await tryRaw(`/Patient/${encodeURIComponent(patientId)}`);
  const patientBodyJson = patientRaw.bodyJson as any | undefined;
  const patient = (() => {
    const p = patientBodyJson;
    if (!p) return undefined;
    const name = extractProviderName(p); // works for Practitioner shape; best-effort for Patient below
    const patientName = (() => {
      const given = p?.name?.[0]?.given?.[0];
      const family = p?.name?.[0]?.family;
      const n = `${given ?? ""} ${family ?? ""}`.trim();
      return n.length ? n : undefined;
    })();
    return {
      id: p?.id,
      name: patientName ?? name,
      birthDate: normalizeText(p?.birthDate),
    } as any;
  })();

  // Extract IDs for lab/med panels from Patient references (direct reads work with `*.read`).
  const observationIdsFromPatient = collectReferenceIds(patientBodyJson ?? {}, "Observation");
  const medicationRequestIdsFromPatient = collectReferenceIds(patientBodyJson ?? {}, "MedicationRequest");
  const medicationIdsFromPatient = collectReferenceIds(patientBodyJson ?? {}, "Medication");

  // 2) Appointments (upcoming)
  const appointmentRaw = await tryRaw(
    `/Appointment?patient=${encodeURIComponent(patientId)}&_count=20`
  );
  const appointments: any[] =
    (appointmentRaw.ok ? (appointmentRaw.bodyJson as any)?.entry?.map((e: any) => e.resource) : []) ??
    [];

  // If Epic blocks Observation/MedicationRequest *search* but allows direct reads,
  // we can still populate those panels by extracting referenced IDs from the Appointment payload.
  const observationIdsFromAppointments = collectReferenceIds(appointments, "Observation");
  const medicationRequestIdsFromAppointments = collectReferenceIds(appointments, "MedicationRequest");
  const medicationIdsFromAppointments = collectReferenceIds(appointments, "Medication");

  // Extract provider IDs from appointments so we can direct-read Practitioner/Location.
  const appointmentProviderIds = Array.from(
    new Set(
      appointments.flatMap((a) => {
        const refs: unknown[] = [];
        const participants = Array.isArray(a?.participant) ? a.participant : [];
        for (const part of participants) refs.push(part?.actor?.reference);
        const performers = Array.isArray(a?.performer) ? a.performer : [];
        for (const perf of performers) refs.push(perf?.actor?.reference);
        return refs.map(refToId).filter(Boolean) as string[];
      })
    )
  );

  // Direct read practitioners for appointment providers (best-effort).
  const practitionerById: Record<string, any> = {};
  await Promise.all(
    appointmentProviderIds.map(async (pid) => {
      practitionerDirectReadCount++;
      const raw = await tryRaw(`/Practitioner/${encodeURIComponent(pid)}`);
      if (raw.ok && raw.bodyJson) {
        practitionerById[pid] = raw.bodyJson;
      }
    })
  );

  // Direct location lookups (best-effort).
  const locationByPractitionerId: Record<string, any> = {};
  await Promise.all(
    appointmentProviderIds.map(async (pid) => {
      try {
        locationDirectReadCount++;
        const raw = await tryRaw(
          `/Location?practitioner=${encodeURIComponent(pid)}&_count=1`
        );
        const loc0 = (raw.bodyJson as any)?.entry?.[0]?.resource;
        if (raw.ok && loc0) locationByPractitionerId[pid] = loc0;
      } catch {
        // ignore
      }
    })
  );

  const appointmentViews: any[] = appointments
    .slice(0, 10)
    .map((a) => {
      const start = normalizeText(a?.start);
      const end = normalizeText(a?.end);
      const status = normalizeText(a?.status);

      const providerIds = Array.from(
        new Set(
          (Array.isArray(a?.participant) ? a.participant : [])
            .map((p: any) => refToId(p?.actor?.reference))
            .filter(Boolean)
            .concat(
              (Array.isArray(a?.performer) ? a.performer : [])
                .map((p: any) => refToId(p?.actor?.reference))
                .filter(Boolean)
            )
        )
      ) as string[];

      const providerNames = providerIds
        .map((pid) => extractProviderName(practitionerById[pid]))
        .filter(Boolean) as string[];

      const locationNames = providerIds
        .map((pid) => extractLocationDisplay(locationByPractitionerId[pid]))
        .filter(Boolean) as string[];

      return {
        id: String(a?.id ?? ""),
        start,
        end,
        status,
        providerNames,
        locationNames,
      };
    })
    .filter((x) => x.id);

  // 3) Observations (labs)
  // Prefer laboratory category; fallback to patient-only search if Epic rejects category filtering.
  let observationRaw = await tryRaw(
    `/Observation?patient=${encodeURIComponent(patientId)}&category=laboratory&_count=20`
  );

  let labViews: any[] = [];

  if (!observationRaw.ok) {
    fallbackUsed.push("ObservationCategoryFallback");
    observationRaw = await tryRaw(
      `/Observation?patient=${encodeURIComponent(patientId)}&_count=20`
    );
  }

  const observations: any[] = observationRaw.ok
    ? (observationRaw.bodyJson as any)?.entry?.map((e: any) => e.resource) ?? []
    : [];

  if (observations.length > 0) {
    labViews = observations
      .map((o) => observationToLabView(o))
      .filter(Boolean);
  } else if (observationIdsFromAppointments.length > 0) {
    // Search returned nothing (or was blocked). Try direct reads from appointment references.
    fallbackUsed.push("ObservationDirectReadFromAppointmentReferences");

    const observationById: Record<string, any> = {};
    await Promise.all(
      observationIdsFromAppointments.slice(0, 12).map(async (oid) => {
        observationDirectReadAttempted++;
        const raw = await tryRaw(`/Observation/${encodeURIComponent(oid)}`);
        if (raw.ok && raw.bodyJson) observationById[oid] = raw.bodyJson;
        if (raw.ok && raw.bodyJson) observationDirectReadOk++;
      })
    );

    labViews = observationIdsFromAppointments
      .slice(0, 12)
      .map((oid) => observationById[oid])
      .filter(Boolean)
      .map((o) => observationToLabView(o))
      .filter(Boolean);
  } else if (observationIdsFromPatient.length > 0) {
    // Searches blocked or returned nothing; attempt direct reads from Patient references.
    fallbackUsed.push("ObservationDirectReadFromPatientReferences");

    const observationById: Record<string, any> = {};
    await Promise.all(
      observationIdsFromPatient.slice(0, 12).map(async (oid) => {
        observationDirectReadFromPatientAttempted++;
        const raw = await tryRaw(`/Observation/${encodeURIComponent(oid)}`);
        if (raw.ok && raw.bodyJson) {
          observationById[oid] = raw.bodyJson;
          observationDirectReadFromPatientOk++;
        }
      })
    );

    labViews = observationIdsFromPatient
      .slice(0, 12)
      .map((oid) => observationById[oid])
      .filter(Boolean)
      .map((o) => observationToLabView(o))
      .filter(Boolean);
  }

  // 4) MedicationRequest (active), fallback to Medication
  const medicationRequestRaw = await tryRaw(
    `/MedicationRequest?patient=${encodeURIComponent(patientId)}&status=active&_count=20`
  );
  let medicationParsed: MedicationView[] = [];
  let medicationReadStatus: { ok: boolean; status?: number } | null = null;

  if (!medicationRequestRaw.ok) {
    fallbackUsed.push("MedicationRequestFallbackToMedication");
    // Some sandboxes block `status=active` but allow MedicationRequest search otherwise.
    const medicationRequestNoStatusRaw = await tryRaw(
      `/MedicationRequest?patient=${encodeURIComponent(patientId)}&_count=20`
    );
    const medicationRaw = await tryRaw(
      `/Medication?patient=${encodeURIComponent(patientId)}&_count=20`
    );
    medicationReadStatus = { ok: medicationRaw.ok, status: medicationRaw.status };

    if (medicationRequestNoStatusRaw.ok) {
      fallbackUsed.push("MedicationRequestNoStatusFallback");
      const medicationRequestNoStatusViews: any[] =
        (medicationRequestNoStatusRaw.bodyJson as any)?.entry?.map(
          (e: any) => e.resource
        ) ?? [];

      medicationParsed = medicationRequestNoStatusViews
        .slice(0, 20)
        .map((m: any) => {
          const id = String(m?.id ?? "");
          const medication = extractCodeText(m?.medicationCodeableConcept);
          const status = normalizeText(m?.status);
          const authoredOn = normalizeText(m?.authoredOn);
          const dosage = (() => {
            const di = Array.isArray(m?.dosageInstruction)
              ? m.dosageInstruction?.[0]
              : undefined;
            return normalizeText(di?.text);
          })();
          if (!id) return undefined;
          return { id, medication, status, authoredOn, dosage };
        })
        .filter(Boolean) as MedicationView[];
    } else {
      // Shape Medication as MedicationView (best-effort)
      const meds: any[] = medicationRaw.ok
        ? (medicationRaw.bodyJson as any)?.entry?.map((e: any) => e.resource) ?? []
        : [];

      medicationParsed = meds
        .map((m) => {
          const id = String(m?.id ?? "");
          const medication = extractCodeText(
            m?.code ?? m?.medicationCodeableConcept
          );
          if (!id) return undefined;
          return {
            id,
            medication,
            status: undefined,
            authoredOn: undefined,
            dosage: extractCodeText(m?.doseForm) ?? undefined,
          };
        })
        .filter(Boolean) as MedicationView[];
    }
  } else {
    const medicationRequestViews: any[] =
      (medicationRequestRaw.bodyJson as any)?.entry?.map(
        (e: any) => e.resource
      ) ?? [];

    medicationParsed = medicationRequestViews
      .slice(0, 20)
      .map((m: any) => {
        const id = String(m?.id ?? "");
        const medication = extractCodeText(m?.medicationCodeableConcept);
        const status = normalizeText(m?.status);
        const authoredOn = normalizeText(m?.authoredOn);
        const dosage = (() => {
          const di = Array.isArray(m?.dosageInstruction)
            ? m.dosageInstruction?.[0]
            : undefined;
          return normalizeText(di?.text);
        })();
        if (!id) return undefined;
        return { id, medication, status, authoredOn, dosage };
      })
      .filter(Boolean) as MedicationView[];
    medicationReadStatus = null;
  }

  // If searches are forbidden (403) and parsed medication lists are empty,
  // use Patient/Appointment references to populate via direct reads.
  if (
    medicationParsed.length === 0 &&
    (medicationRequestIdsFromAppointments.length > 0 ||
      medicationIdsFromAppointments.length > 0 ||
      medicationRequestIdsFromPatient.length > 0 ||
      medicationIdsFromPatient.length > 0)
  ) {
    fallbackUsed.push("MedicationDirectReadFromReferences");

    const medicationRequestIdsAll = Array.from(
      new Set([
        ...medicationRequestIdsFromAppointments,
        ...medicationRequestIdsFromPatient,
      ])
    );
    const medicationIdsAll = Array.from(
      new Set([...medicationIdsFromAppointments, ...medicationIdsFromPatient])
    );

    const medicationRequestById: Record<string, any> = {};
    await Promise.all(
      medicationRequestIdsAll.slice(0, 12).map(async (mid) => {
        medicationRequestDirectReadAttempted++;
        const raw = await tryRaw(`/MedicationRequest/${encodeURIComponent(mid)}`);
        if (raw.ok && raw.bodyJson) {
          medicationRequestById[mid] = raw.bodyJson;
          medicationRequestDirectReadOk++;
          medicationDirectReadAttempted++;
          // (we'll count dosage parsing implicitly; view conversion below)
        }
      })
    );

    const medicationFromRequests = medicationRequestIdsAll
      .slice(0, 12)
      .map((mid) => medicationRequestById[mid])
      .filter(Boolean)
      .map((m) => medicationRequestToMedicationView(m))
      .filter(Boolean) as MedicationView[];

    if (medicationFromRequests.length > 0) {
      medicationParsed = medicationFromRequests;
    } else if (medicationIdsAll.length > 0) {
      const medicationById: Record<string, any> = {};
      await Promise.all(
        medicationIdsAll.slice(0, 12).map(async (mid) => {
          medicationDirectReadAttempted++;
          const raw = await tryRaw(`/Medication/${encodeURIComponent(mid)}`);
          if (raw.ok && raw.bodyJson) {
            medicationById[mid] = raw.bodyJson;
            medicationDirectReadOk++;
          }
        })
      );

      medicationParsed = medicationIdsAll
        .slice(0, 12)
        .map((mid) => medicationById[mid])
        .filter(Boolean)
        .map((m: any) => ({
          id: String(m?.id ?? ""),
          medication: extractCodeText(m?.code ?? m?.medicationCodeableConcept),
          status: undefined,
          authoredOn: undefined,
          dosage: extractCodeText(m?.doseForm) ?? undefined,
        }))
        .filter((x: any) => x.id) as MedicationView[];
    }
  }

  // If both medication searches fail/return nothing, try direct reads from Appointment references.
  if (
    medicationParsed.length === 0 &&
    (medicationRequestIdsFromAppointments.length > 0 || medicationIdsFromAppointments.length > 0)
  ) {
    fallbackUsed.push("MedicationDirectReadFromAppointmentReferences");

    const medicationRequestById: Record<string, any> = {};
    await Promise.all(
      medicationRequestIdsFromAppointments.slice(0, 12).map(async (mid) => {
        medicationRequestDirectReadAttempted++;
        const raw = await tryRaw(`/MedicationRequest/${encodeURIComponent(mid)}`);
        if (raw.ok && raw.bodyJson) medicationRequestById[mid] = raw.bodyJson;
        if (raw.ok && raw.bodyJson) medicationRequestDirectReadOk++;
      })
    );

    medicationParsed = medicationRequestIdsFromAppointments
      .slice(0, 12)
      .map((mid) => medicationRequestById[mid])
      .filter(Boolean)
      .map((m) => medicationRequestToMedicationView(m))
      .filter(Boolean) as MedicationView[];

    if (medicationParsed.length === 0 && medicationIdsFromAppointments.length > 0) {
      const medicationById: Record<string, any> = {};
      await Promise.all(
        medicationIdsFromAppointments.slice(0, 12).map(async (mid) => {
          medicationDirectReadAttempted++;
          const raw = await tryRaw(`/Medication/${encodeURIComponent(mid)}`);
          if (raw.ok && raw.bodyJson) medicationById[mid] = raw.bodyJson;
          if (raw.ok && raw.bodyJson) medicationDirectReadOk++;
        })
      );

      medicationParsed = medicationIdsFromAppointments
        .slice(0, 12)
        .map((mid) => medicationById[mid])
        .filter(Boolean)
        .map((m: any) => {
          const id = String(m?.id ?? "");
          if (!id) return undefined;
          return {
            id,
            medication: extractCodeText(m?.code ?? m?.medicationCodeableConcept),
            status: undefined,
            authoredOn: undefined,
            dosage: extractCodeText(m?.doseForm) ?? undefined,
          } as MedicationView;
        })
        .filter(Boolean) as MedicationView[];
    }
  }

  // 5) CareTeam: participants -> Practitioner/Location
  const careTeamRaw = await tryRaw(
    `/CareTeam?patient=${encodeURIComponent(patientId)}&_count=20`
  );
  let careTeamResult = careTeamRaw;
  if (!careTeamRaw.ok) {
    // Some sandboxes accept `subject=Patient/{id}` instead of `patient={id}`.
    careTeamResult = await tryRaw(
      `/CareTeam?subject=Patient/${encodeURIComponent(patientId)}&_count=20`
    );
  }

  if (!careTeamResult.ok) {
    fallbackUsed.push("CareTeamFallbackToAppointmentProviders");
    // Derive care-team-like list from Appointment providers only.
    const derivedCareTeam: CareTeamView[] = appointmentProviderIds.map(
      (pid) => ({
        id: `derived-${pid}`,
        role: "Care team (derived)",
        providerId: pid,
        providerName: extractProviderName(practitionerById[pid]),
        npi: extractNpi(practitionerById[pid]),
        locationName: extractLocationDisplay(locationByPractitionerId[pid]),
        specialties: extractProviderSpecialties(practitionerById[pid] ?? {}),
      })
    );

    return Response.json({
      patient,
      appointments: appointmentViews,
      labs: labViews,
      medications: medicationParsed,
      careTeam: derivedCareTeam,
      debug: {
        patientRead: { ok: patientRaw.ok, status: patientRaw.status },
        appointmentRead: {
          ok: appointmentRaw.ok,
          status: appointmentRaw.status,
        },
        observationRead: { ok: observationRaw.ok, status: observationRaw.status },
        medicationRequestRead: { ok: medicationRequestRaw.ok, status: medicationRequestRaw.status },
        medicationRead: medicationReadStatus ?? { ok: false, status: undefined },
        careTeamRead: { ok: false, status: careTeamResult.status },
        practitionerDirectReadCount,
        locationDirectReadCount,
        observationIdsFromAppointmentsCount:
          observationIdsFromAppointments.length,
        medicationRequestIdsFromAppointmentsCount:
          medicationRequestIdsFromAppointments.length,
        medicationIdsFromAppointmentsCount: medicationIdsFromAppointments.length,
        observationDirectReadAttempted,
        observationDirectReadOk,
        medicationRequestDirectReadAttempted,
        medicationRequestDirectReadOk,
        medicationDirectReadAttempted,
        medicationDirectReadOk,
        observationDirectReadFromPatientAttempted,
        observationDirectReadFromPatientOk,
        observationIdsFromPatientCount: observationIdsFromPatient.length,
        medicationRequestIdsFromPatientCount:
          medicationRequestIdsFromPatient.length,
        medicationIdsFromPatientCount: medicationIdsFromPatient.length,
        fallbackUsed,
        tokenScope,
      },
    });
  }

  const careTeams: any[] =
    (careTeamResult.bodyJson as any)?.entry?.map((e: any) => e.resource) ?? [];

  // Extract participant provider IDs and role hints.
  const participantRows: Array<{
    careTeamId: string;
    providerId?: string;
    role?: string;
  }> = [];
  for (const ct of careTeams) {
    const ctId = String(ct?.id ?? "");
    const participants = Array.isArray(ct?.participant) ? ct.participant : [];
    for (const p of participants) {
      const memberRef = p?.member?.reference;
      const pid = refToId(memberRef);
      const roleText =
        normalizeText(p?.role?.[0]?.text) ||
        normalizeText(p?.role?.text) ||
        normalizeText(p?.role?.coding?.[0]?.display) ||
        normalizeText(p?.role?.coding?.[0]?.code);
      if (!ctId || !pid) continue;
      participantRows.push({ careTeamId: ctId, providerId: pid, role: roleText });
    }
  }

  const careTeamProviderIds = Array.from(
    new Set(participantRows.map((r) => r.providerId).filter(Boolean) as string[])
  );

  const careTeamPractitionerById: Record<string, any> = {};
  await Promise.all(
    careTeamProviderIds.map(async (pid) => {
      practitionerDirectReadCount++;
      const raw = await tryRaw(`/Practitioner/${encodeURIComponent(pid)}`);
      if (raw.ok && raw.bodyJson) careTeamPractitionerById[pid] = raw.bodyJson;
    })
  );

  const careTeamLocationByPractitionerId: Record<string, any> = {};
  await Promise.all(
    careTeamProviderIds.map(async (pid) => {
      try {
        locationDirectReadCount++;
        const raw = await tryRaw(
          `/Location?practitioner=${encodeURIComponent(pid)}&_count=1`
        );
        const loc0 = (raw.bodyJson as any)?.entry?.[0]?.resource;
        if (raw.ok && loc0) careTeamLocationByPractitionerId[pid] = loc0;
      } catch {
        // ignore
      }
    })
  );

  const careTeamViews: CareTeamView[] = participantRows
    .slice(0, 20)
    .map((r, idx) => {
      const pid = r.providerId as string;
      const p = careTeamPractitionerById[pid];
      return {
        id: `${r.careTeamId}-${pid}-${idx}`,
        role: r.role,
        providerId: pid,
        providerName: extractProviderName(p),
        npi: extractNpi(p),
        locationName: extractLocationDisplay(
          careTeamLocationByPractitionerId[pid]
        ),
        specialties: extractProviderSpecialties(p ?? {}),
      };
    })
    .filter(Boolean) as CareTeamView[];

  return Response.json({
    patient,
    appointments: appointmentViews,
    labs: labViews,
    medications: medicationParsed,
    careTeam: careTeamViews,
    debug: {
      patientRead: { ok: patientRaw.ok, status: patientRaw.status },
      appointmentRead: { ok: appointmentRaw.ok, status: appointmentRaw.status },
      observationRead: { ok: observationRaw.ok, status: observationRaw.status },
      medicationRequestRead: {
        ok: medicationRequestRaw.ok,
        status: medicationRequestRaw.status,
      },
      medicationRead: medicationReadStatus ?? { ok: false, status: undefined },
      careTeamRead: { ok: careTeamRaw.ok, status: careTeamRaw.status },
      practitionerDirectReadCount,
      locationDirectReadCount,
      observationIdsFromAppointmentsCount:
        observationIdsFromAppointments.length,
      medicationRequestIdsFromAppointmentsCount:
        medicationRequestIdsFromAppointments.length,
      medicationIdsFromAppointmentsCount: medicationIdsFromAppointments.length,
      observationDirectReadAttempted,
      observationDirectReadOk,
      medicationRequestDirectReadAttempted,
      medicationRequestDirectReadOk,
      medicationDirectReadAttempted,
      medicationDirectReadOk,
      observationDirectReadFromPatientAttempted,
      observationDirectReadFromPatientOk,
      observationIdsFromPatientCount: observationIdsFromPatient.length,
      medicationRequestIdsFromPatientCount:
        medicationRequestIdsFromPatient.length,
      medicationIdsFromPatientCount: medicationIdsFromPatient.length,
      fallbackUsed,
      tokenScope,
    },
  });
}

