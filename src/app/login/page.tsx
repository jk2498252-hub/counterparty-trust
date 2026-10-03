import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getSessionUser } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { err } = await searchParams;
  return (
    <AuthShell title="Sign in">
      <Flash err={err} />
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
