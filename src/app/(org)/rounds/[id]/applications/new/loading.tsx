import { de } from "@/ui/strings";
import { SkeletonForm, SkeletonHeading } from "@/ui/skeletons";

// design.md D6: the capture form's shape — back-link, heading, and a form card with six field
// rows, one textarea block and the submit button.
export default function CaptureApplicationLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <SkeletonForm fields={6} />
        <div className="skeleton h-32 w-full" />
      </div>
    </div>
  );
}
