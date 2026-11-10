/** Shown instantly while an attendant screen loads, so taps never feel dead. */
export default function AttendLoading() {
  return (
    <div className="mx-auto flex max-w-3xl animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded-full bg-line" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="att-card h-40" />
        <div className="att-card h-40" />
      </div>
      <div className="att-card h-24" />
    </div>
  );
}
