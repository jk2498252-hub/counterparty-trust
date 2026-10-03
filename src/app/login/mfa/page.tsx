import { redirect } from "next/navigation";
import { verifyMfaLoginAction } from "@/app/actions/auth";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getPendingMfaUser } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if (!(await getPendingMfaUser())) redirect("/login");
  const { err } = await searchParams;
  return (
    <AuthShell title="Enter your code">
      <Flash err={err} />
      <form action={verifyMfaLoginAction} className="space-y-4">
        <div>
          <label className="label" htmlFor="code">6-digit code from your authenticator app</label>
          <input className="input text-center text-lg tracking-[0.4em]" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus />
        </div>
        <SubmitButton className="btn w-full">Verify</SubmitButton>
      </form>
    </AuthShell>
  );
}
