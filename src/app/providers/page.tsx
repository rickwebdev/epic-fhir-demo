import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ProvidersClient from "./ProvidersClient";

export default async function ProvidersPage() {
  const session = await getSession();

  if (!session.accessToken) {
    redirect("/");
  }

  return <ProvidersClient />;
}

