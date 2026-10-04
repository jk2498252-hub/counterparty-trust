import { redirect } from "next/navigation";
import { createFirstAdminAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { firstRunMode, hasAnyUser } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if (await hasAnyUser()) redirect("/login");
  const mode = firstRunMode();
  if (mode === "disabled") redirect("/login");
  const { err } = await searchParams;
  return (
    <AuthShell title="Welcome: create your admin account">
      <p className="mb-4 text-sm text-muted">
        This is the first time the workbench has been opened. Create the admin account; you can add analysts and reviewers afterwards
        under Team.
      </p>
      <Flash err={err} />
      <form action={createFirstAdminAction} className="space-y-4">
        {mode === "token" && <div>
          <label className="label" htmlFor="setupToken">Server setup token</label>
          <input className="input" id="setupToken" name="setupToken" type="password" autoComplete="off" required />
        </div>}
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input className="input" id="name" name="name" required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password (12+ characters)</label>
          <input className="input" id="password" name="password" type="password" minLength={12} autoComplete="new-password" required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repeat password</label>
          <input className="input" id="confirm" name="confirm" type="password" minLength={12} autoComplete="new-password" required />
        </div>
        <SubmitButton className="btn w-full">Create admin account</SubmitButton>
      </form>
    </AuthShell>
  );
}
