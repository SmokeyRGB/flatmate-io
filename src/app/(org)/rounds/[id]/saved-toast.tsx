"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SuccessToast } from "@/ui/success-toast";

// Shows the success notice once, when the page is reached with ?saved=1 after a capture. The
// trigger is created once per mount, so the toast opens on arrival and can be dismissed. The
// parameter is then taken out of the URL, so a reload or a back-navigation does not announce a
// save that did not happen again (code review).
export function SavedToast({ message }: { message: string }) {
  const [trigger] = useState<object>(() => ({}));
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);
  return <SuccessToast message={message} trigger={trigger} />;
}
