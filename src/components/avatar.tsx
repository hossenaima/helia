/** A face or a letter. The fallback is the first letter of the name in a
 *  muted circle — quiet, and it keeps every list the same shape whether or
 *  not anyone uploaded a photo. */
export function Avatar({
  src,
  name,
  size,
}: {
  src: string | null;
  name: string;
  size: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data URL; next/image buys nothing
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-sunk font-bold text-ink-muted"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
