// Closes the detail slot on any other soft navigation (design D1): a parallel slot keeps its last
// active state across soft navigations, so without this a navigation from an open card to
// /casting/screening could leave the card mounted. Renders nothing.
export default function DetailCatchAll() {
  return null;
}
