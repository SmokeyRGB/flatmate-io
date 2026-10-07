import { LoadingStatus } from "@/ui/loading-status";
import { SkeletonForm, SkeletonHeading } from "@/ui/skeletons";

// design.md D3/D6: settings/page.tsx's shape — back-link, heading, and SettingsForm's own card.
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-md space-y-6 p-6" aria-busy="true">
      <LoadingStatus />
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <SkeletonForm fields={1} />
      </div>
    </div>
  );
}
