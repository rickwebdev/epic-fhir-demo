"use client";

import { FormEvent, useEffect, useState } from "react";

interface Provider {
  id: string;
  name: string;
  specialty: string;
  npi?: string;
}

const SPECIALTIES = [
  "Cardiology",
  "Dermatology",
  "Oncology",
  "Neurology",
  "Orthopedics",
];

export default function ProvidersPage() {
  const [specialty, setSpecialty] = useState(SPECIALTIES[0]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchProviders(selectedSpecialty: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/fhir/practitioners?specialty=${encodeURIComponent(
          selectedSpecialty
        )}`
      );
      if (!res.ok) {
        throw new Error(`Request failed with ${res.status}`);
      }
      const data = await res.json();
      setProviders(data.providers ?? []);
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
    // Initial load with default specialty after auth
    fetchProviders(SPECIALTIES[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-[#F4F6F7] px-6 py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#1A5276]">
            Provider Finder
          </h1>
        </header>

        <section className="bg-white rounded-xl shadow p-6 space-y-4">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-4 items-center"
          >
            <label className="w-full sm:w-auto text-sm font-medium text-gray-700">
              Specialty
              <select
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              >
                {SPECIALTIES.map((s) => (
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
              {error}
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
              No providers found yet. Try searching by specialty.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {providers.map((provider) => (
              <article
                key={provider.id}
                className="bg-white rounded-xl shadow p-4 space-y-2 border border-[#D6EAF8]"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  {provider.name || "Unknown Provider"}
                </h2>
                <p className="text-sm text-gray-700">
                  {provider.specialty || "General Practice"}
                </p>
                {provider.npi && (
                  <p className="text-xs text-gray-500">NPI: {provider.npi}</p>
                )}
                <div className="mt-2 inline-flex items-center rounded-full bg-[#D6EAF8] px-3 py-1 text-xs font-medium text-[#1E8449]">
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

