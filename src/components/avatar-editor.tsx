"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { setAvatarAction } from "@/app/actions/settings";

type Offset = { x: number; y: number };

/** Keep the image covering the circle: the drawn size is cover-fit × zoom, so
 *  the offset can only travel half of whatever spills past the stage on each
 *  axis. Re-run this whenever zoom changes, not just on drag — zooming out
 *  shrinks the drawn image and a stale offset would show empty canvas. */
function clampOffset(
  offset: Offset,
  zoom: number,
  bitmap: ImageBitmap,
  stageSize: number,
): Offset {
  const coverScale = Math.max(stageSize / bitmap.width, stageSize / bitmap.height);
  const drawW = bitmap.width * coverScale * zoom;
  const drawH = bitmap.height * coverScale * zoom;
  const maxX = Math.max(0, (drawW - stageSize) / 2);
  const maxY = Math.max(0, (drawH - stageSize) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/** Same transform at any output size — the live stage and the saved 256×256
 *  canvas both call this, the save just scales `size` and the offset with it. */
function drawInto(
  ctx: CanvasRenderingContext2D,
  size: number,
  bitmap: ImageBitmap,
  zoom: number,
  offset: Offset,
  stageSize: number,
) {
  const coverScale = Math.max(size / bitmap.width, size / bitmap.height);
  const drawW = bitmap.width * coverScale * zoom;
  const drawH = bitmap.height * coverScale * zoom;
  const k = size / stageSize;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(
    bitmap,
    size / 2 - drawW / 2 + offset.x * k,
    size / 2 - drawH / 2 + offset.y * k,
    drawW,
    drawH,
  );
}

/** The whole crop flow: pick a photo, drag and zoom it inside a circular
 *  stage, save a 256×256 JPEG. Settings-only — the display side is `Avatar`. */
export function AvatarEditor({ current, name }: { current: string | null; name: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [stageSize, setStageSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The stage's actual pixel size depends on viewport width (capped at 256),
  // so it is measured once the crop stage is in the DOM rather than assumed.
  useEffect(() => {
    if (!bitmap || !stageRef.current) return;
    setStageSize(stageRef.current.clientWidth);
  }, [bitmap]);

  useEffect(() => {
    if (!bitmap || !stageSize || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) drawInto(ctx, stageSize, bitmap, zoom, offset, stageSize);
  }, [bitmap, stageSize, zoom, offset]);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      // "from-image" is not the default — without it a portrait photo's EXIF
      // rotation is ignored and it uploads lying on its side.
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      setBitmap(bmp);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch {
      setError("Could not read that photo.");
    }
  }

  function closeCrop() {
    setBitmap(null);
    setStageSize(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCancel() {
    bitmap?.close();
    setError(null);
    closeCrop();
  }

  function handleZoom(next: number) {
    setZoom(next);
    if (bitmap && stageSize) {
      setOffset((prev) => clampOffset(prev, next, bitmap, stageSize));
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !bitmap || !stageSize) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset(
      clampOffset(
        { x: dragRef.current.ox + dx, y: dragRef.current.oy + dy },
        zoom,
        bitmap,
        stageSize,
      ),
    );
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleSave() {
    if (!bitmap || !stageSize) return;
    setError(null);
    startTransition(async () => {
      const out = document.createElement("canvas");
      out.width = 256;
      out.height = 256;
      const ctx = out.getContext("2d");
      if (!ctx) {
        setError("Could not render that photo.");
        return;
      }
      drawInto(ctx, 256, bitmap, zoom, offset, stageSize);
      const dataUrl = out.toDataURL("image/jpeg", 0.8);
      const result = await setAvatarAction(dataUrl);
      if (!result.ok) {
        setError(result.error ?? "Could not save.");
        return;
      }
      bitmap.close();
      closeCrop();
      router.refresh();
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await setAvatarAction(null);
      if (!result.ok) {
        setError(result.error ?? "Could not remove it.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card mt-4 p-5">
      {bitmap ? (
        <>
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative mx-auto aspect-square w-full max-w-64 touch-none select-none overflow-hidden rounded-full bg-surface-sunk"
          >
            <canvas
              ref={canvasRef}
              width={stageSize || 1}
              height={stageSize || 1}
              className="block h-full w-full"
            />
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="mt-4 w-full"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              className="btn btn-quiet !py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="btn btn-primary !py-2"
            >
              {pending ? "Saving" : "Save"}
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-4">
          <Avatar src={current} name={name} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Profile picture</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Shown to friends beside your name.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label className="btn btn-quiet !py-1.5 cursor-pointer">
                {current ? "Change" : "Add a photo"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="sr-only"
                />
              </label>
              {current && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={pending}
                  className="btn btn-quiet !py-1.5"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <p role="status" className={`mt-3 text-sm ${error ? "text-up" : ""}`}>
        {error ?? ""}
      </p>
    </div>
  );
}
