export default function HomePage() {
  const preloginBgUrl =
    "https://fhir.epic.com/mychart-fhir/en-us/images/prelogin.jpg";
  const epicLogoUrl = "https://open.epic.com/Content/Images/logo.png?version=R41429";

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Full-bleed hero background (Epic pre-login image) */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${preloginBgUrl})` }}
        aria-hidden="true"
      />
      {/* Dark overlay to keep text readable across different viewport crops */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/60"
        aria-hidden="true"
      />

      <div className="relative min-h-screen flex items-center justify-center px-6 py-10">
        <section className="w-full max-w-xl bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-white/20 p-8 space-y-5 text-center">
          <div className="flex justify-center">
            <div className="rounded-lg bg-white/85 border border-[#D6EAF8] px-3 py-2 shadow-sm">
              <img
                src={epicLogoUrl}
                alt="Open Epic logo"
                className="h-14 w-auto object-contain"
              />
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-[#1A5276]">
              Epic FHIR Patient Portal
            </h1>
            <p className="text-gray-700">
              Demo sandbox (dummy data). Connect to Epic using SMART on FHIR.
            </p>
          </div>

          <div className="space-y-3">
            <form action="/api/auth/login" method="GET">
              <button
                type="submit"
                className="w-full rounded-md bg-[#1A5276] px-4 py-2 text-white font-medium hover:bg-[#16425f] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A5276]/40"
              >
                Connect to Epic
              </button>
            </form>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-sm text-gray-500">
              Sandbox demo: each login has limited patient data, so what you
              see on the dashboard will vary.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

