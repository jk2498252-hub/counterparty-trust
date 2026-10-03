export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Counterparty Trust</div>
          <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">Internal verification workbench</p>
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
