"use client";

import { useEffect, useState } from "react";
import { SuccessToast } from "@/ui/success-toast";

// Shows the success notice once, when the page is reached with ?saved=<application id> after a capture
// (or ?updated=1 after a correction: the `param` prop names which). The trigger is created once per
// mount, so the toast opens on arrival and can be dismissed.
//
// The parameter is then taken out of the URL, so a reload or a back-navigation does not announce a
// save that did not happen again (code review). With `history.replaceState`, not `router.replace`:
// the router would re-render the page without the parameter and unmount this toast at once
// (walkthrough finding). Next.js keeps its router in sync with a native replaceState.
export function SavedToast({
  message,
  link,
  param = "saved",
}: {
  message: string;
  link?: { href: string; label: string };
  param?: "saved" | "updated";
}) {
  const [trigger] = useState<object>(() => ({}));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [param]);
  return <SuccessToast message={message} trigger={trigger} link={link} />;
}
