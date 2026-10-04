/** A report's issue date does not refresh the checks it contains. */
export function evidenceDateRange(evidence: { accessResult: string; checkedDate: string }[]): { oldest: string; newest: string } | null {
  const dates = evidence.filter((e) => e.accessResult === "EXAMINED" && /^\d{4}-\d{2}-\d{2}$/.test(e.checkedDate)).map((e) => e.checkedDate).sort();
  return dates.length ? { oldest: dates[0], newest: dates[dates.length - 1] } : null;
}
