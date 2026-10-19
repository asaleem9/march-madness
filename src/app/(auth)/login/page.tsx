import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/utils";
import { LoginForm } from "../_components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    const { redirect: target } = await searchParams;
    redirect(safeRedirectPath(target ?? null));
  }
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
