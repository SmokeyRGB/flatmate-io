import { de } from "@/ui/strings";
import { SkeletonForm, SkeletonHeading } from "@/ui/skeletons";

// design.md D3/D6/Assumption 3: RegisterForm's own card shape (a heading, two fields and a
// submit button) — static and near-instant, but shaped like the page anyway so the rule stays
// free of exceptions a later change could hide behind.
export default function RegisterLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading width="w-1/2" />
        <SkeletonForm fields={2} />
      </div>
    </div>
  );
}
