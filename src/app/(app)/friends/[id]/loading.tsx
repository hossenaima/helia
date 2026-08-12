export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-5 w-32 rounded bg-surface-sunk" />
      <div className="ml-auto mt-5 h-10 w-3/5 rounded-2xl bg-surface-sunk" />
      <div className="mt-2 h-10 w-3/5 rounded-2xl bg-surface-sunk" />
      <div className="ml-auto mt-2 h-10 w-2/5 rounded-2xl bg-surface-sunk" />
    </div>
  );
}
