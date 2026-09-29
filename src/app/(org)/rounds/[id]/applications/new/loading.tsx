import { de } from "@/ui/strings";
import { SkeletonHeading } from "@/ui/skeletons";

// design.md D6: step 1's shape — a heading, one textarea block and one button (the human dropped „Überspringen": Weiter alone moves on).
export default function CaptureApplicationLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <div className="skeleton h-40 w-full" />
        <div className="flex justify-end">
          <div className="skeleton h-10 w-24" />
        </div>
      </div>
    </div>
  );
}
