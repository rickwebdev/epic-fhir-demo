"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, FlaskConical, Pill, Printer, Users } from "lucide-react";

type FhirPatient = {
  id?: string;
  name?: string;
  birthDate?: string;
};

type AppointmentView = {
  id: string;
  start?: string;
  end?: string;
  status?: string;
  providerNames: string[];
  locationNames: string[];
};

type LabView = {
  id: string;
  code?: string;
  effective?: string;
  value?: string;
  referenceRange?: string;
};

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

type DashboardResponse = {
  patient?: FhirPatient;
  appointments: AppointmentView[];
  labs: LabView[];
  medications: MedicationView[];
  careTeam: CareTeamView[];
};

export default function DashboardClient() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const preloginBgUrl =
    "https://fhir.epic.com/mychart-fhir/en-us/images/prelogin.jpg";

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard/summary", {
          cache: "no-store",
        });
        if (res.status === 401) {
          setError("Not connected to Epic. Please connect and try again.");
          return;
        }
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Request failed with ${res.status}`);
        }
        const json = (await res.json()) as DashboardResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load dashboard."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen relative overflow-hidden px-6 py-10">
      {/* Full-bleed hero background (Epic pre-login image) */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${preloginBgUrl})` }}
        aria-hidden="true"
      />
      {/* Dark overlay to keep content readable */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/60"
        aria-hidden="true"
      />

      <div className="relative max-w-6xl mx-auto bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-white/20 p-6 space-y-6">
        <header className="flex items-center justify-between gap-6">
          <h1 className="text-2xl font-semibold text-[#1A5276] leading-tight">
            Patient Dashboard
          </h1>
          <nav className="flex items-center gap-6">
            <Link
              href="/providers"
              className="inline-flex items-center py-2 text-sm font-medium text-[#1A5276] hover:underline"
            >
              Provider Finder
            </Link>
            <form action="/api/auth/logout" method="POST" className="m-0 inline">
              <button
                type="submit"
                className="inline-flex items-center py-2 text-sm font-medium text-[#1A5276] hover:underline"
              >
                Logout
              </button>
            </form>
          </nav>
        </header>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {error}{" "}
            <Link href="/" className="underline">
              Connect to Epic
            </Link>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-14">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1A5276]/20 border-t-[#1A5276]" />
            <p className="text-sm font-medium text-[#1A5276]">
              Loading patient dashboard…
            </p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <section className="bg-white rounded-xl shadow-sm border border-[#D6EAF8] p-6 space-y-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {data.patient?.name ? `Welcome, ${data.patient.name}` : "Patient"}
              </h2>
              <p className="text-sm text-gray-600">
                {data.patient?.birthDate
                  ? `DOB: ${data.patient.birthDate}`
                  : "DOB: (unavailable)"}
              </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="bg-white rounded-xl shadow-sm border border-[#D6EAF8] p-6 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <CalendarDays
                    className="h-4 w-4 text-[#1A5276]"
                    aria-hidden="true"
                  />
                  Upcoming Appointments
                </h3>
                {data.appointments.length === 0 ? (
                  <p className="text-sm text-gray-600">No appointments.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.appointments.slice(0, 6).map((a) => (
                      <li
                        key={a.id}
                        className="border border-[#D6EAF8] rounded-lg p-4"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {a.start ?? a.id}
                        </p>
                        {a.status ? (
                          <p className="text-xs text-gray-600 mt-0.5">
                            Status: {a.status}
                          </p>
                        ) : null}

                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">
                              Provider
                            </p>
                            <p className="text-xs text-gray-700 truncate">
                              {a.providerNames.length
                                ? a.providerNames.join(", ")
                                : "Unknown"}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500">
                              Location
                            </p>
                            <p className="text-xs text-gray-700 truncate">
                              {a.locationNames.length
                                ? a.locationNames.join(", ")
                                : "Unknown"}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#D6EAF8] p-6 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <FlaskConical
                    className="h-4 w-4 text-[#1A5276]"
                    aria-hidden="true"
                  />
                  Lab Results
                </h3>
                {data.labs.length === 0 ? (
                  <p className="text-sm text-gray-600">No lab observations.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.labs.slice(0, 8).map((o) => (
                      <li
                        key={o.id}
                        className="border border-[#D6EAF8] rounded-lg p-4"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {o.code ?? "Lab"}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {o.effective ? `When: ${o.effective}` : ""}
                        </p>
                        <p className="text-sm text-gray-800 mt-2">
                          {o.value ?? "(no value)"}
                        </p>
                        {o.referenceRange ? (
                          <p className="text-xs text-gray-500">
                            Reference: {o.referenceRange}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#D6EAF8] p-6 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Pill
                    className="h-4 w-4 text-[#1A5276]"
                    aria-hidden="true"
                  />
                  Active Prescriptions
                </h3>
                {data.medications.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    No active MedicationRequest records.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {data.medications.slice(0, 8).map((m) => (
                      (() => {
                        const cleanedDosage = (m.dosage ?? "")
                          // Epic sandbox sometimes includes a trailing "Print" token in the free-text.
                          .replace(/\s*,?\s*print\s*$/i, "")
                          .trim();

                        return (
                      <li
                        key={m.id}
                        className="border border-[#D6EAF8] rounded-lg p-4"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {m.medication ?? "Medication"}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {m.authoredOn ? `Authored: ${m.authoredOn}` : ""}
                          {m.status ? ` · Status: ${m.status}` : ""}
                        </p>
                        {cleanedDosage ? (
                          <p className="text-xs text-gray-700 mt-2 leading-relaxed">
                            Dose: {cleanedDosage}
                          </p>
                        ) : null}
                        <div className="mt-3">
                          <Link
                            href={`/print/medications/${encodeURIComponent(m.id)}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[#D6EAF8]/70 px-3 py-1 text-xs font-medium text-[#1A5276] hover:bg-[#D6EAF8]"
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            Print
                          </Link>
                        </div>
                      </li>
                        );
                      })()
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-[#D6EAF8] p-6 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Users
                    className="h-4 w-4 text-[#1A5276]"
                    aria-hidden="true"
                  />
                  Care Team
                </h3>
                {data.careTeam.length === 0 ? (
                  <p className="text-sm text-gray-600">No care team entries.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.careTeam.slice(0, 10).map((ct) => (
                      <li
                        key={ct.id}
                        className="border border-[#D6EAF8] rounded-lg p-4"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {ct.providerName ?? "Provider"}
                        </p>
                        {ct.role ? (
                          <p className="text-xs text-gray-600 mt-0.5">
                            Role: {ct.role}
                          </p>
                        ) : null}
                        {ct.npi ? (
                          <p className="text-xs text-gray-500">NPI: {ct.npi}</p>
                        ) : null}
                        {ct.locationName ? (
                          <p className="text-xs text-gray-600">
                            Location: {ct.locationName}
                          </p>
                        ) : null}
                        {ct.specialties?.length ? (
                          <p className="text-xs text-gray-700">
                            Specialty: {ct.specialties.slice(0, 3).join(", ")}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

          </>
        )}
      </div>
    </main>
  );
}

