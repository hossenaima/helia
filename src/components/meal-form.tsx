"use client";

import { useActionState, useRef, useState } from "react";
import { saveMealAction, type MealActionResult } from "@/app/actions/meals";
import { suggestMealName } from "@/lib/meals";

const INITIAL: MealActionResult = { ok: false };

/**
 * Longest edge of the picture that gets uploaded.
 *
 * The model tiles an image at 768px, so detail beyond about a thousand pixels
 * buys nothing and costs the person on mobile data a wait every time they log
 * lunch. A 12 megapixel phone photo is ~4MB and would also blow the 1MB body a
 * server action accepts by default; downscaling first means no limit anywhere
 * has to be raised.
 */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.75;

/**
 * Decode, rotate, shrink, re-encode — all before anything leaves the phone.
 *
 * `imageOrientation: "from-image"` is named rather than left to default: a
 * photo taken in portrait carries its rotation in EXIF, and a canvas that
 * ignores that uploads a meal lying on its side.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("could not encode");
  return blob;
}

export function MealForm({
  date,
  aiEnabled,
}: {
  date: string;
  /** False when no GEMINI_API_KEY is configured. */
  aiEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveMealAction, INITIAL);
  const [name, setName] = useState(() => suggestMealName(new Date().getHours()));
  const [note, setNote] = useState("");
  const [showMacros, setShowMacros] = useState(false);

  // Whether the description goes to the estimator is carried by the submit
  // button's own name/value, which the browser serialises natively. A React
  // state flag set in onClick would race the submission.
  const [pendingAi, setPendingAi] = useState(false);

  // Shrunk at the moment it is chosen rather than on submit, so the wait
  // happens while the person is still typing and `action` stays synchronous.
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setPhotoError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    try {
      const blob = await downscale(file);
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setPhotoError("That image could not be read. Try a photo from the camera.");
    }
  }

  return (
    <form
      action={(formData) => {
        // The <input type="file"> is not in the form: what gets sent is the
        // downscaled copy, under the same name the action reads.
        if (photo) formData.set("photo", photo.blob, "meal.jpg");
        formAction(formData);
        setNote("");
        setName(suggestMealName(new Date().getHours()));
        clearPhoto();
      }}
      className="card mt-4 p-5"
    >
      <input type="hidden" name="date" value={date} />

      <label htmlFor="name" className="eyebrow block">
        Meal
      </label>
      <input
        id="name"
        name="name"
        type="text"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name it anything"
        className="
          mt-2 w-full border-b border-rule bg-transparent pb-1 text-lg
          placeholder:text-ink-faint focus:border-trace focus:outline-none
        "
      />

      <label htmlFor="note" className="eyebrow block mt-5 block">
        What you ate
      </label>
      <textarea
        id="note"
        name="note"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Two eggs, sourdough toast with butter, black coffee"
        className="
          mt-2 w-full rounded-lg bg-surface-sunk p-3 text-sm
          placeholder:text-ink-faint focus:outline-2 focus:outline-trace
        "
      />

      {/* No `capture` attribute on purpose: with it, iOS opens the camera and
          takes the photo library away. Without it the phone offers both. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => choosePhoto(e.target.files?.[0])}
      />

      {photo ? (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL
              from this device; next/image is for optimising remote assets. */}
          <img
            src={photo.url}
            alt="The meal you are about to log"
            className="size-16 shrink-0 rounded-lg object-cover"
          />
          <p className="min-w-0 flex-1 text-xs text-ink-muted">
            Read when you tap estimate. Sent to the model to be identified, and
            not stored by Helia.
          </p>
          <button
            type="button"
            onClick={clearPhoto}
            className="eyebrow shrink-0 transition-colors hover:!text-up"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={!aiEnabled}
          className="eyebrow mt-3 transition-colors hover:!text-ink"
        >
          + Photo of the meal
        </button>
      )}

      {photoError && (
        <p role="alert" className="mt-2 text-xs text-up">
          {photoError}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <div>
          <label htmlFor="calories" className="eyebrow block">
            Calories
          </label>
          <input
            id="calories"
            name="calories"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="—"
            className="
              tnum mt-1.5 w-24 border-b border-rule bg-transparent pb-1 text-lg
              placeholder:text-ink-faint focus:border-trace focus:outline-none
            "
          />
        </div>

        {/* The box and the AI button look like alternatives and are not: a
            typed total is kept and the estimate is scaled to match it. Nothing
            in the layout said so. */}
        <p className="w-full order-last text-xs text-ink-muted">
          Know the total? Type it — an estimate will be split to add up to it,
          from a photo as well as from words.
        </p>

        <button
          type="button"
          onClick={() => setShowMacros((v) => !v)}
          aria-expanded={showMacros}
          className="eyebrow pb-2 transition-colors hover:!text-ink"
        >
          {showMacros ? "− Macros" : "+ Macros"}
        </button>
      </div>

      {showMacros && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
          <GramField id="protein" label="Protein" tint="var(--protein)" />
          <GramField id="carbs" label="Carbs" tint="var(--carbs)" />
          <GramField id="fat" label="Fat" tint="var(--fat)" />
          <GramField id="fiber" label="Fiber" tint="var(--carbs)" />
          <GramField id="sodium" label="Sodium (mg)" tint="var(--fat)" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          name="estimate"
          value="0"
          onClick={() => setPendingAi(false)}
          disabled={pending || note.trim() === "" || name.trim() === ""}
          className="btn btn-soft flex-1"
        >
          Log it
        </button>

        <button
          type="submit"
          name="estimate"
          value="1"
          onClick={() => setPendingAi(true)}
          // A photo is a description too, so this is the one path that does not
          // need words.
          disabled={
            pending ||
            (note.trim() === "" && !photo) ||
            name.trim() === "" ||
            !aiEnabled
          }
          title={
            aiEnabled
              ? undefined
              : "Add GEMINI_API_KEY to your environment to turn this on."
          }
          className="btn btn-primary flex-1"
        >
          {pending && pendingAi
            ? photo
              ? "Reading the photo"
              : "Estimating"
            : photo
              ? "Read the photo"
              : "Estimate for me"}
        </button>
      </div>

      {!aiEnabled && (
        <p className="mt-3 text-xs text-ink-muted">
          Estimation is off. Add a Gemini API key to your environment to turn it
          on.
        </p>
      )}

      <p
        role="status"
        className={`mt-3 text-sm ${state.error ? "text-up" : "text-ink-muted"}`}
      >
        {state.error ?? (state.ok ? (state.note ?? "Logged.") : "")}
      </p>
    </form>
  );
}

function GramField({
  id,
  label,
  tint,
}: {
  id: string;
  label: string;
  tint: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="eyebrow flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: tint }}
        />
        {label} (g)
      </label>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        className="
          tnum mt-1.5 w-20 border-b border-rule bg-transparent pb-1 text-base
          placeholder:text-ink-faint focus:border-trace focus:outline-none
        "
      />
    </div>
  );
}
