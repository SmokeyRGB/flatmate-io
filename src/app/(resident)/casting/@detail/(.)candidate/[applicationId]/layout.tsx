import type { ReactNode } from "react";
import { DetailSheet } from "../../../detail-sheet";

// The ONE frame of the sliding card (design D1): Next nests layout, then loading, then page, so the
// skeleton and the content share this one DetailSheet instance and the enter animation, the focus
// and the `inert` marking run once.
export default function InterceptedCandidateLayout({ children }: { children: ReactNode }) {
  return <DetailSheet>{children}</DetailSheet>;
}
