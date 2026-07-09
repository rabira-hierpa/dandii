"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="cursor-pointer rounded-lg bg-[#152018] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#24352A] print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
