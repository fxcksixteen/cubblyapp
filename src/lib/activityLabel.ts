import { KNOWN_GAMES } from "@/lib/knownGames";

const SOFTWARE_ACTIVITY_NAMES = new Set(
  Object.values(KNOWN_GAMES)
    .filter((activity) => activity.type === "software")
    .map((activity) => activity.name.toLowerCase())
);

export function isSoftwareActivity(
  act: { name?: string | null; details?: string | null; activity_type?: string | null } | undefined | null,
): boolean {
  if (!act?.name) return false;
  return (
    act.details === "software" ||
    act.activity_type === "using" ||
    SOFTWARE_ACTIVITY_NAMES.has(act.name.toLowerCase())
  );
}

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
  const isSoftware = isSoftwareActivity(act);
  return `${isSoftware ? "Using" : "Playing"} ${act.name}`;
}
