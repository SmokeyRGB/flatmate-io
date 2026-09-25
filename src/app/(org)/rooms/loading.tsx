import { de } from "@/ui/strings";
import { SkeletonForm, SkeletonHeading, SkeletonList } from "@/ui/skeletons";

// design.md D3/D6: rooms/page.tsx's shape — back-link, heading, the add-room form, and the room
// list.
export default function RoomsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6" aria-busy="true">
      <p role="status" className="sr-only">
        {de.common.loading}
      </p>
      <div className="space-y-6" aria-hidden="true">
        <SkeletonHeading />
        <SkeletonForm fields={0} />
        <SkeletonList rows={3} />
      </div>
    </div>
  );
}
