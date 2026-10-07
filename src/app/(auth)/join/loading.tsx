import { LoadingStatus } from "@/ui/loading-status";
import { SkeletonForm, SkeletonHeading, SkeletonText } from "@/ui/skeletons";

// design.md D3/D6: shaped like join-code-form.tsx's own card (a heading, a helper line, one
// field and a submit button).
export default function JoinCodeLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <LoadingStatus />
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading width="w-2/3" />
        <SkeletonText width="w-full" />
        <SkeletonForm fields={1} />
      </div>
    </div>
  );
}
