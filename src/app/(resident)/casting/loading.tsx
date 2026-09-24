export default function CastingLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-24 w-full rounded-2xl" />
    </div>
  );
}
