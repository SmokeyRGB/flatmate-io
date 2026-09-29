"use client";

import { useState } from "react";
import { SuccessToast } from "@/ui/success-toast";

// Shows the success notice once, when the page is reached with ?saved=1 after a capture. The
// trigger is created once per mount, so the toast opens on arrival and can be dismissed.
export function SavedToast({ message }: { message: string }) {
  const [trigger] = useState<object>(() => ({}));
  return <SuccessToast message={message} trigger={trigger} />;
}
