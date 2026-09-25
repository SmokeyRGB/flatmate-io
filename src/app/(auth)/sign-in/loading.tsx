import { de } from "@/ui/strings";
import { SkeletonForm, SkeletonHeading } from "@/ui/skeletons";

// design.md D3/D6/Assumption 3: SignInForm's own shape — a heading, the tab track, and a card
// with two fields and a submit button.
export default function SignInLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading width="w-1/2" />
        <div className="skeleton h-9 w-full rounded-full" />
        <SkeletonForm fields={2} />
      </div>
    </div>
  );
}
