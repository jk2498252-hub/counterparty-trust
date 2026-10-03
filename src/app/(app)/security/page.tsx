import { changePasswordAction, confirmMfaSetupAction } from "@/app/actions/auth";
import { newMfaSetup } from "@/lib/mfa";
import { Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { mfaRequired, requireUser } from "@/lib/session";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; setup?: string }> }) {
  const user = await requireUser({ allowMfaSetup: true });
  const sp = await searchParams;
  const needsSetup = !user.totpEnabled || sp.setup === "1";
  const setup = needsSetup ? await newMfaSetup(user.id, user.email) : null;
  return (
    <>
      <PageHeader title="Security" subtitle="Two-factor login and password" />
      <Flash ok={sp.ok} err={sp.err} />
      {mfaRequired() && !user.mfaPassed && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Turn on two-factor login to continue. Case files hold supplier bank details and client documents.
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Two-factor login</h2>
          {setup ? (
            <form action={confirmMfaSetupAction} className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password).</li>
                <li>Scan this QR code, or type the key below.</li>
                <li>Enter the 6-digit code it shows.</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for authenticator app" className="h-44 w-44 rounded border border-line" />
              <code className="block break-all rounded bg-paper px-2 py-1 text-xs">{setup.secret}</code>
              <input type="hidden" name="secret" value={setup.secret} />
              <input type="hidden" name="sig" value={setup.sig} />
              <input className="input" name="code" inputMode="numeric" placeholder="123456" maxLength={8} required />
              <SubmitButton>Turn on two-factor login</SubmitButton>
            </form>
          ) : (
            <div className="space-y-3 text-sm">
              <p>Two-factor login is on for {user.email}.</p>
              <a href="/security?setup=1" className="btn-secondary">Move to a new phone</a>
            </div>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Change password</h2>
          <form action={changePasswordAction} className="space-y-3">
            <input className="input" type="password" name="current" placeholder="Current password" autoComplete="current-password" required />
            <input className="input" type="password" name="next" placeholder="New password (12+ characters)" autoComplete="new-password" minLength={12} required />
            <SubmitButton className="btn-secondary">Change password</SubmitButton>
          </form>
        </section>
      </div>
    </>
  );
}
