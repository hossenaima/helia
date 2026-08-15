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
      {copied ? "Copied" : "Share as text"}
    </button>
  );
}
