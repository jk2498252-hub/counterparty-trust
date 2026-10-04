import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createUserAction, updateUserAction } from "@/app/actions/team";
import { Badge, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { dateStr } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireUser({ roles: ["ADMIN"] });
  const sp = await searchParams;
  const rows = await db.select().from(users).orderBy(asc(users.name));
  return (
    <>
      <PageHeader title="Team" subtitle="Analysts produce cases. Reviewers check and release them. Admins manage people." />
      <Flash ok={sp.ok} err={sp.err} />
      <section className="card mb-6 overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Two-factor</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}{u.id === me.id && <span className="ml-1 text-xs text-muted">(you)</span>}</td>
                <td>{u.email}</td>
                <td>
                  <form action={updateUserAction} className="flex gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="op" value="role" />
                    <select name="role" defaultValue={u.role} className="input py-1">
                      <option value="ANALYST">Analyst</option>
                      <option value="REVIEWER">Reviewer</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <SubmitButton className="btn-secondary px-2 py-1 text-xs">Set</SubmitButton>
                  </form>
                </td>
                <td>{u.totpEnabled ? <Badge color="green">On</Badge> : <Badge color="amber">Off</Badge>}</td>
                <td>{u.active ? (u.lockedUntil && u.lockedUntil > new Date() ? <Badge color="amber">Locked</Badge> : <Badge color="green">Active</Badge>) : <Badge>Deactivated</Badge>}</td>
                <td>{dateStr(u.createdAt)}</td>
                <td className="whitespace-nowrap">
                  <form action={updateUserAction} className="inline">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="op" value="reset" />
                    <input type="password" name="password" className="input mb-2" placeholder="Reset password (12+ characters)" aria-label={`Reset password for ${u.name}`} autoComplete="new-password" minLength={12} required />
                    <SubmitButton className="text-xs underline" confirm={`Reset password and two-factor for ${u.name}?`}>Reset login</SubmitButton>
                  </form>
                  {u.id !== me.id && (
                    <form action={updateUserAction} className="ml-3 inline">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="op" value={u.active ? "deactivate" : "activate"} />
                      <SubmitButton className="text-xs text-red-700 underline">{u.active ? "Deactivate" : "Reactivate"}</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2 className="mb-4 font-semibold">Add a person</h2>
        <form action={createUserAction} className="grid items-end gap-3 md:grid-cols-5">
          <div><label className="label">Name</label><input name="name" className="input" required /></div>
          <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input" defaultValue="ANALYST">
              <option value="ANALYST">Analyst</option>
              <option value="REVIEWER">Reviewer</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div><label className="label">Initial password</label><input name="password" type="password" className="input" autoComplete="new-password" minLength={12} required /></div>
          <div><SubmitButton>Create account</SubmitButton></div>
        </form>
        <p className="mt-3 text-xs text-muted">Choose an initial password and share it privately. They must change it and set up two-factor login before opening case files.</p>
      </section>
    </>
  );
}
