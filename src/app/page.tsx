import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/identity/session-cookie";
import { landingPathFor } from "./landing";

export default async function Home() {
  const current = await getCurrentSession();
  redirect(current ? landingPathFor(current.context) : "/sign-in");
}
