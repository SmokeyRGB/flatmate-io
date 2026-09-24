// design.md Decision 11 (G-N6): a skeleton in the shape of heading and body, no spinner.
export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-8 w-40" />
      <div className="skeleton h-16 w-full" />
    </div>
  );
}
