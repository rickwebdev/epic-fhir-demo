"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

interface Provider {
  id: string;
  name: string;
  specialty: string;
  specialties?: string[];
  npi?: string;
  locationName?: string;
  locationAddress?: string;
}

interface PractitionerDebugInfo {
  extractedPractitionerIdsCount?: number;
  careTeamPractitionerIdsCount?: number;
  appointmentPractitionerIdsCount?: number;
  candidatesCount?: number;
  practitionerReadAttempts?: number;
}

const SPECIALTIES = [
  "Cardiology",
  "Dermatology",
  "Oncology",
  "Neurology",
  "Orthopedics",
  // The sandbox patient context we use for Phase 1 often returns practitioners
  // under a generic label like "General Practice".
  // Including it ensures the provider finder can still display results.
  "General Practice",
];

export default function ProvidersClient() {
  const [specialty, setSpecialty] = useState(SPECIALTIES[0]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [availableSpecialties, setAvailableSpecialties] = useState<string[]>(
    []
  );
  const [debugInfo, setDebugInfo] = useState<PractitionerDebugInfo | null>(
    null
  );
  const [tokenScope, setTokenScope] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preloginBgUrl =
    "https://fhir.epic.com/mychart-fhir/en-us/images/prelogin.jpg";

  async function fetchProviders(selectedSpecialty: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/fhir/practitioners?specialty=${encodeURIComponent(
          selectedSpecialty
        )}`
      );
      if (res.status === 401) {
        setProviders([]);
        setAvailableSpecialties([]);
        setDebugInfo(null);
        setTokenScope(null);
        setSource(null);
        setError("Not connected to Epic. Please connect and try again.");
        return;
      }
      if (!res.ok) {
        let detail: string | undefined;
        try {
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const data = await res.json();
            if (data?.debug) {
              detail = `${data.error ?? "Error"}\n${JSON.stringify(
                data.debug,
                null,
                2
              )}`;
            } else {
              if (data?.error) {
                const msg = data?.message ? `: ${String(data.message)}` : "";
                detail = `${String(data.error)}${msg}`;
              } else {
                detail = JSON.stringify(data);
              }
            }
          } else {
            detail = await res.text();
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(detail || `Request failed with ${res.status}`);
      }
      const data = await res.json();
      setProviders(data.providers ?? []);
      setAvailableSpecialties(data.availableSpecialties ?? []);
      setDebugInfo(data.debug ?? null);
      setTokenScope(data.tokenScope ?? null);
      setSource(data.source ?? null);

      // Initial load (no specialty param) should align the dropdown with what Epic exposes
      // for this sandbox patient, otherwise users will see "no providers found" immediately.
      if (!selectedSpecialty) {
        const first = data.availableSpecialties?.[0];
        if (typeof first === "string" && first.trim().length > 0) {
          setSpecialty(first);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load providers."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    fetchProviders(specialty);
  }

  useEffect(() => {
    // Initial load: request without a specialty so we show what is available
    // for the current sandbox patient context.
    fetchProviders("");
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

      <div className="relative max-w-4xl mx-auto bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-white/20 p-6 space-y-6">
        <header className="flex items-center justify-between gap-6">
          <h1 className="text-2xl font-semibold text-[#1A5276]">
            Provider Finder
          </h1>
          <nav className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center py-2 text-sm font-medium text-[#1A5276] hover:underline"
            >
              Patient Dashboard
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

        <section className="bg-white rounded-xl shadow-sm border border-[#D6EAF8] p-6 space-y-4">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-4 sm:items-end"
          >
            <label className="w-full sm:w-auto text-sm font-medium text-gray-700">
              Specialty
              <select
                className="mt-1 block w-full sm:w-64 rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              >
                <option value="">All (patient-derived)</option>
                {(availableSpecialties.length > 0
                  ? availableSpecialties
                  : SPECIALTIES
                ).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="w-full sm:w-auto rounded-md bg-[#1A5276] px-4 py-2 text-white text-sm font-medium hover:bg-[#16425f] transition-colors"
              disabled={loading}
            >
              {loading ? "Searching..." : "Search Providers"}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
              {error}{" "}
              <Link href="/" className="underline">
                Connect to Epic
              </Link>
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              <div className="h-20 rounded-md bg-gray-200 animate-pulse" />
              <div className="h-20 rounded-md bg-gray-200 animate-pulse" />
            </div>
          )}

          {!loading && providers.length === 0 && !error && (
            <p className="text-sm text-gray-600">
              No providers found for{" "}
              <span className="font-medium">
                {specialty || "All (patient-derived)"}
              </span>
              .
              {availableSpecialties.length > 0 && (
                <>
                  {" "}
                  Available in this sandbox patient:{" "}
                  <span className="font-medium">
                    {availableSpecialties.slice(0, 5).join(", ")}
                    {availableSpecialties.length > 5 ? ", ..." : ""}
                  </span>
                  .
                </>
              )}
              {debugInfo && (
                <span className="block mt-2 text-xs text-gray-500">
                  Debug: extractedPractitionerIdsCount={
                    debugInfo.extractedPractitionerIdsCount ?? 0
                  }
                  , careTeamPractitionerIdsCount={
                    debugInfo.careTeamPractitionerIdsCount ?? 0
                  }
                  , appointmentPractitionerIdsCount={
                    debugInfo.appointmentPractitionerIdsCount ?? 0
                  }
                  , candidatesCount={debugInfo.candidatesCount ?? 0}.
                </span>
              )}
              {source && (
                <span className="block mt-1 text-xs text-gray-400">
                  Source used: {source}
                </span>
              )}
              {tokenScope && (
                <span className="block mt-1 text-xs text-gray-400">
                  Token scope includes search?{" "}
                  {tokenScope.toLowerCase().includes("patient/practitioner.search")
                    ? "YES"
                    : "NO"}
                  <div className="mt-1 break-all">
                    Token scope: {tokenScope}
                  </div>
                </span>
              )}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {providers.map((provider) => (
              <article
                key={provider.id}
                className="bg-white rounded-xl shadow-sm border border-[#D6EAF8] p-4 space-y-2 min-h-[220px] flex flex-col"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  {provider.name || "Unknown Provider"}
                </h2>
                <p className="text-sm text-gray-700">
                  {provider.specialties?.[0] ?? provider.specialty ?? "General Practice"}
                </p>
                {provider.specialties && provider.specialties.length > 1 && (
                  <p className="text-xs text-gray-500">
                    Also: {provider.specialties.slice(1, 4).join(", ")}
                  </p>
                )}
                {provider.npi && (
                  <p className="text-xs text-gray-500">NPI: {provider.npi}</p>
                )}
                {provider.locationName && (
                  <p className="text-xs text-gray-500 mt-1">
                    {provider.locationName}
                  </p>
                )}
                {provider.locationAddress && (
                  <p className="text-xs text-gray-400">
                    {provider.locationAddress}
                  </p>
                )}
                <div className="mt-auto self-start shrink-0 w-fit inline-flex items-center rounded-full bg-[#D6EAF8] px-3 py-1 text-xs font-medium text-[#1E8449]">
                  Accepting patients
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

