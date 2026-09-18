import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/identity/session-cookie";

export default async function Home() {
  const current = await getCurrentSession();
  redirect(current ? "/dashboard" : "/sign-in");
}
