import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getSessionUser, mfaRequired } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { firstRunMode, hasAnyUser } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const current = await getSessionUser();
  if (current && !(current.totpEnabled && !current.mfaPassed)) redirect(current.mustChangePassword || (mfaRequired() && !current.mfaPassed) ? "/security" : "/");
  const empty = !(await hasAnyUser());
  if (empty && firstRunMode() !== "disabled") redirect("/setup");
  const { err } = await searchParams;
  return (
    <AuthShell title="Sign in">
      <Flash err={err} />
      {empty && <p className="mb-4 text-sm text-muted">An administrator must provision the first account on the server before sign-in is available.</p>}
      <form action={loginAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <SubmitButton className="btn w-full">Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
