"use client";

import { useState } from "react";

/**
 * Hands the report to the share sheet as structured text — the version an LLM
 * or a Messages thread actually wants. Where there is no share sheet
 * (desktop), it copies to the clipboard and says so.
 */
export function ShareReport({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        // Cancelling the sheet is a decision, not a failure — do nothing.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else: fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused too; nothing useful left to do.
    }
  }

  return (
    <button type="button" onClick={share} className="btn btn-primary print-hide">
      {/* The iOS share glyph — the tray with the arrow — so the pill reads as
          "this opens the share sheet" before the word does. */}
      <svg
        aria-hidden
        width="14"
        height="16"
        viewBox="0 0 14 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mr-1.5 inline-block align-[-2px]"
      >
        <path d="M2 7h-1v8h12V7h-1" transform="translate(1 0)" />
        <path d="M7 10V1M4 4l3-3 3 3" />
      </svg>
      {copied ? "Copied" : "Share"}
    </button>
  );
}
