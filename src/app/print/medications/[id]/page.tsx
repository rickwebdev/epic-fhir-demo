import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { fhirFetchRaw } from "@/lib/fhir";
import PrintClient from "./PrintClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

function normalizeText(x: unknown): string | undefined {
  if (typeof x !== "string") return undefined;
  const t = x.trim();
  return t.length ? t : undefined;
}

function extractPatientName(patient: any): string | undefined {
  const p = patient;
  const given = p?.name?.[0]?.given?.[0];
  const family = p?.name?.[0]?.family;
  const n = `${given ?? ""} ${family ?? ""}`.trim();
  return n.length ? n : undefined;
}

function extractMedicationName(mr: any): string | undefined {
  return (
    normalizeText(mr?.medicationCodeableConcept?.text) ||
    normalizeText(mr?.medicationCodeableConcept?.coding?.[0]?.display) ||
    normalizeText(mr?.medicationCodeableConcept?.coding?.[0]?.code)
  );
}

function extractDosageText(mr: any): string | undefined {
  const di0 = Array.isArray(mr?.dosageInstruction)
    ? mr.dosageInstruction?.[0]
    : undefined;
  return normalizeText(di0?.text);
}

export default async function MedicationPrintPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession();

  if (!session.accessToken || !session.patientId) {
    redirect("/");
  }

  const token = session.accessToken;
  const patientId = session.patientId;

  const [patientRaw, medRaw] = await Promise.all([
    fhirFetchRaw(`/Patient/${encodeURIComponent(patientId)}`, token),
    fhirFetchRaw(`/MedicationRequest/${encodeURIComponent(id)}`, token),
  ]);

  if (!medRaw.ok) {
    return (
      <main className="min-h-screen bg-white px-6 py-10">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-4 print:hidden">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-[#1A5276] hover:underline"
            >
              Back to dashboard
            </Link>
            <PrintClient />
          </div>
          <div className="rounded-xl border border-gray-200 p-6">
            <h1 className="text-xl font-semibold text-gray-900">
              Medication Summary
            </h1>
            <p className="mt-2 text-sm text-gray-700">
              Couldn&apos;t load this medication from the sandbox API (HTTP{" "}
              {medRaw.status}).
            </p>
            <p className="mt-2 text-xs text-gray-500 break-all">
              MedicationRequest/{id}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const patient = patientRaw.ok ? (patientRaw.bodyJson as any) : undefined;
  const mr = medRaw.bodyJson as any;

  const patientName = extractPatientName(patient) ?? "Patient";
  const patientDob = normalizeText(patient?.birthDate);

  const medName = extractMedicationName(mr) ?? "Medication";
  const status = normalizeText(mr?.status);
  const authoredOn = normalizeText(mr?.authoredOn);
  const dosage = extractDosageText(mr);
  const requester = normalizeText(mr?.requester?.display);

  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[#1A5276] hover:underline"
          >
            Back to dashboard
          </Link>
          <PrintClient autoPrint />
        </div>

        <div className="rounded-2xl border border-gray-200 p-6 shadow-sm print:shadow-none">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Medication Summary
              </h1>
              <p className="mt-1 text-sm text-gray-700">
                {patientName}
                {patientDob ? (
                  <span className="text-gray-500"> · DOB {patientDob}</span>
                ) : null}
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>Epic Sandbox (R4)</div>
              <div className="mt-1">MedicationRequest/{id}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Medication
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">{medName}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Status
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {status ?? "Unknown"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Authored
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {authoredOn ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Requester
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {requester ?? "—"}
              </p>
            </div>
          </div>

          {dosage ? (
            <div className="mt-4 rounded-lg border border-gray-200 p-4">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">
                Instructions
              </p>
              <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                {dosage}
              </p>
            </div>
          ) : null}

          <p className="mt-6 text-xs text-gray-500">
            Note: Epic sandbox data varies by login and may be limited.
          </p>
        </div>
      </div>
    </main>
  );
}

