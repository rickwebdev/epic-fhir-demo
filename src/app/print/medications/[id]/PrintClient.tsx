"use client";

import { Printer } from "lucide-react";

export default function PrintClient() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-md bg-[#1A5276] px-3 py-2 text-sm font-medium text-white hover:bg-[#16425f] transition-colors"
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      Print
    </button>
  );
}

