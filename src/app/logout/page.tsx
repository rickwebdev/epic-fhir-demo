import Link from "next/link";

export default function LogoutPage() {
  const preloginBgUrl =
    "https://fhir.epic.com/mychart-fhir/en-us/images/prelogin.jpg";

  return (
    <main className="min-h-screen relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${preloginBgUrl})` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/60"
        aria-hidden="true"
      />

      <div className="relative min-h-screen flex items-center justify-center px-6 py-10">
        <section className="w-full max-w-xl bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-white/20 p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <span className="inline-flex items-center justify-center rounded-full bg-[#D6EAF8]/80 p-4">
              <span
                className="text-5xl leading-none origin-bottom animate-wave-hand select-none"
                aria-hidden="true"
              >
                👋
              </span>
            </span>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-[#1A5276]">
              You&apos;re logged out
            </h1>
            <p className="text-gray-600">
              Thanks for using the Epic FHIR Provider Portal. Come back anytime.
            </p>
            <p className="text-xs text-[#1A5276]/80 font-medium">
              Powered by Open Epic Sandbox
            </p>
          </div>
          <div>
            <Link
              href="/"
              className="inline-flex items-center justify-center w-full rounded-md bg-[#1A5276] px-4 py-2 text-white font-medium hover:bg-[#16425f] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A5276]/40"
            >
              Back to portal
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
