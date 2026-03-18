import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#F4F6F7] flex items-center justify-center px-6">
      <div className="max-w-xl w-full bg-white rounded-xl shadow-md p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-[#1A5276]">
          Epic FHIR Provider Portal
        </h1>
        <p className="text-gray-700">
          Connect to Epic&apos;s sandbox using SMART on FHIR and explore the
          provider finder experience.
        </p>
        <form action="/api/auth/login" method="GET">
          <button
            type="submit"
            className="w-full rounded-md bg-[#1A5276] px-4 py-2 text-white font-medium hover:bg-[#16425f] transition-colors"
          >
            Connect to Epic
          </button>
        </form>
        <p className="text-sm text-gray-500">
          Once connected, you&apos;ll be redirected to the{" "}
          <Link href="/providers" className="text-[#1A5276] underline">
            provider search
          </Link>
          .
        </p>
        <div className="mt-4 text-sm text-gray-500">
          Or jump straight to your{" "}
          <Link href="/dashboard" className="text-[#1A5276] underline">
            patient dashboard
          </Link>
          .
        </div>
      </div>
    </main>
  );
}

