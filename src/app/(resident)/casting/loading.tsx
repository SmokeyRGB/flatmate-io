import { de } from "@/ui/strings";
import { SkeletonCircle, SkeletonHeading, SkeletonText } from "@/ui/skeletons";

// The shape of the scoreboard: a heading and three rows, each a ring and two text lines
// (loading-feedback design.md D6, composed from the shared src/ui/skeletons.tsx shapes).
export default function CastingLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-4" aria-hidden="true">
        <SkeletonText width="w-24" />
        <SkeletonHeading width="w-40" />
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="card ranking-row">
              <SkeletonCircle />
              <div className="flex-1 space-y-2">
                <SkeletonText width="w-2/3" />
                <SkeletonText width="w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
