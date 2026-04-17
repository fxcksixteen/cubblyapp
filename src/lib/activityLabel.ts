/** Map activity_type/details from the DB to the right UI verb. */
export function activityLabel(act: { name?: string | null; details?: string | null; activity_type?: string | null } | undefined | null): string | null {
  if (!act?.name) return null;
  const isSoftware = act.details === "software" || act.activity_type === "using";
  return `${isSoftware ? "Using" : "Playing"} ${act.name}`;
}
