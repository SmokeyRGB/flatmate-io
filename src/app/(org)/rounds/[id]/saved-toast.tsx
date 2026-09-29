"use client";

import { useEffect, useState } from "react";
import { SuccessToast } from "@/ui/success-toast";

// Shows the success notice once, when the page is reached with ?saved=<application id> after a capture. The
// trigger is created once per mount, so the toast opens on arrival and can be dismissed.
//
// The parameter is then taken out of the URL, so a reload or a back-navigation does not announce a
// save that did not happen again (code review). With `history.replaceState`, not `router.replace`:
// the router would re-render the page without the parameter and unmount this toast at once
// (walkthrough finding). Next.js keeps its router in sync with a native replaceState.
export function SavedToast({ message, link }: { message: string; link?: { href: string; label: string } }) {
  const [trigger] = useState<object>(() => ({}));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("saved")) return;
    url.searchParams.delete("saved");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  return <SuccessToast message={message} trigger={trigger} link={link} />;
}
