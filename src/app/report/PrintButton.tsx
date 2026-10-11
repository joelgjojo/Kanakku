"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="print:hidden inline-flex items-center gap-2 h-10 rounded-lg bg-pen px-4 font-semibold text-white hover:bg-pen-dark">
      <Printer size={16} /> Print or save as PDF
    </button>
  );
}
