"use client";
import { useState } from "react";
import Link from "next/link";
import { Field } from "./ui";
import { supplierMatches, type SupplierIdentity } from "@/lib/supplier-matching";

export function SupplierFields({ suppliers, selected = "new" }: { suppliers: SupplierIdentity[]; selected?: string }) {
  const [supplierId, setSupplierId] = useState(selected);
  const [profile, setProfile] = useState({ id: "new", country: "KE", legalName: "", registrationNumber: "", kraPin: "", domain: "" });
  const matches = supplierId === "new" ? supplierMatches(profile, suppliers) : [];
  const input = (key: "legalName" | "registrationNumber" | "kraPin" | "domain") => ({ id: key, name: key, className: "input", value: profile[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setProfile(p => ({ ...p, [key]: event.target.value })) });
  return <section className="card grid gap-4 md:grid-cols-2">
    <h2 className="font-semibold md:col-span-2">Supplier</h2>
    <Field label="Existing supplier" name="counterpartyId" hint="Reuse a profile from earlier cases"><select id="counterpartyId" name="counterpartyId" className="input" value={supplierId} onChange={event => setSupplierId(event.target.value)}><option value="new">+ New supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.legalName}{s.kraPin ? ` (${s.kraPin})` : ""}</option>)}</select></Field>
    <Field label="Supplier name as supplied" name="legalName"><input {...input("legalName")} /></Field>
    <Field label="Registration number (if known)" name="registrationNumber"><input {...input("registrationNumber")} /></Field>
    <Field label="KRA PIN (if known)" name="kraPin"><input {...input("kraPin")} /></Field>
    <Field label="Website domain" name="domain"><input {...input("domain")} /></Field>
    <Field label="Sector" name="sector"><input id="sector" name="sector" className="input" /></Field>
    {matches.length > 0 && <div role="note" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm md:col-span-2"><h3 className="font-semibold">Possible existing supplier</h3><p className="mt-1">Confirm the exact entity before creating another profile. Matching fields are candidates for review.</p><ul className="mt-2 space-y-2">{matches.slice(0, 5).map(m => <li key={m.supplier.id}><button type="button" onClick={() => setSupplierId(m.supplier.id)} className="font-semibold text-brand underline">Use {m.supplier.legalName}</button> · {m.reasons.join(", ")} · <Link href={`/suppliers/${m.supplier.id}`} target="_blank" rel="noopener noreferrer" className="underline">View profile</Link></li>)}</ul></div>}
  </section>;
}
