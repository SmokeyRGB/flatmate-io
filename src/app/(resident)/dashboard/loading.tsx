// design.md Decision 11 (G-N6): heading bar, one featured-card outline, one quiet-card outline —
// no spinner, no layout jump.
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="space-y-2">
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-4 w-32" />
      </div>
      <div className="skeleton h-40 w-full rounded-2xl" />
      <div className="skeleton h-24 w-full rounded-2xl" />
    </div>
  );
}
