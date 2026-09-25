// loading-feedback design.md D3: shared skeleton shapes built from the existing `.skeleton` class
// (`--color-muted`, 09-Design-System.md). Server-safe (no "use client"). Each page's own
// `loading.tsx` composes these into the shape of its content, inside a container that carries
// `aria-busy="true"` and a visually hidden `de.common.loading` — see any `loading.tsx` for that
// wrapping pattern. These components render only the `aria-hidden` bars themselves.

export function SkeletonHeading({ width = "w-40" }: { width?: string }) {
  return <div className={`skeleton h-7 ${width}`} />;
}

export function SkeletonText({ width = "w-32" }: { width?: string }) {
  return <div className={`skeleton h-4 ${width}`} />;
}

// A card-shaped block with N lines — the shape of a single list card or content card.
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="card space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton h-4 ${i === 0 ? "w-2/3" : "w-1/3"}`} />
      ))}
    </div>
  );
}

// N stacked list rows, each shaped like one of this page's own `<li className="card">` rows.
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="card">
          <div className="skeleton h-4 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

// A form card: N label+field pairs and a submit-button-shaped bar.
export function SkeletonForm({ fields = 2 }: { fields?: number }) {
  return (
    <div className="card space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-9 w-full" />
        </div>
      ))}
      <div className="skeleton h-10 w-full" />
    </div>
  );
}

// design.md D4: the resident/org header's own Suspense fallback for the display-reads component
// (identity/household/navigation-access in `(resident)`, the identity label in `(org)`) — a pill
// roughly the size of what it replaces (the avatar-menu trigger / identity-label text), so the
// header doesn't jump when the real content streams in.
export function HeaderSkeleton() {
  return <div className="skeleton h-9 w-32 rounded-full" />;
}
