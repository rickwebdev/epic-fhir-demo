"use client";

import { useEffect } from "react";

export default function PrintClient({ autoPrint }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 150);
    return () => window.clearTimeout(t);
  }, [autoPrint]);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center rounded-md bg-[#1A5276] px-3 py-2 text-sm font-medium text-white hover:bg-[#16425f] transition-colors"
    >
      Print
    </button>
  );
}

