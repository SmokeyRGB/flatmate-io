import { LoadingStatus } from "@/ui/loading-status";
import { SkeletonForm, SkeletonHeading } from "@/ui/skeletons";

// F3 change 3, design D5: the correction form's shape, a heading and the details card.
export default function EditApplicationLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6" aria-busy="true">
      <LoadingStatus />
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <SkeletonForm fields={3} />
      </div>
    </div>
  );
}
