/**
 * Map activity_type/details from the DB to the right UI verb.
 * Pass `isOnline` to suppress stale activity rows from users who have
 * disconnected without cleaning up (e.g. force-quit Electron app).
 */
export function activityLabel(
  act: { name?: string | null; details?: string | null; activity_type?: string | null } | undefined | null,
  isOnline: boolean = true,
): string | null {
  if (!act?.name) return null;
  if (!isOnline) return null;
  const isSoftware = act.details === "software" || act.activity_type === "using";
  return `${isSoftware ? "Using" : "Playing"} ${act.name}`;
}
