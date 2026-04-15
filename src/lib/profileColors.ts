// Profile color palette for new users
// Each entry has a PFP background color and a matching banner gradient
export const profileColors = [
  { id: "blue",    bg: "#5865f2", banner: "linear-gradient(135deg, #5865f2 0%, #8b95f7 40%, #f59e0b 100%)" },
  { id: "red",     bg: "#ed4245", banner: "linear-gradient(135deg, #ed4245 0%, #f47b7d 40%, #ff9a3c 100%)" },
  { id: "purple",  bg: "#9b59b6", banner: "linear-gradient(135deg, #9b59b6 0%, #c39bd3 40%, #e74c8a 100%)" },
  { id: "orange",  bg: "#e67e22", banner: "linear-gradient(135deg, #e67e22 0%, #f0b27a 40%, #f1c40f 100%)" },
  { id: "teal",    bg: "#1abc9c", banner: "linear-gradient(135deg, #1abc9c 0%, #76d7c4 40%, #3498db 100%)" },
  { id: "pink",    bg: "#e91e63", banner: "linear-gradient(135deg, #e91e63 0%, #f48fb1 40%, #ce93d8 100%)" },
  { id: "green",   bg: "#3ba55c", banner: "linear-gradient(135deg, #3ba55c 0%, #6dd98e 40%, #2d8cf0 100%)" },
  { id: "yellow",  bg: "#f1c40f", banner: "linear-gradient(135deg, #f1c40f 0%, #f9e154 40%, #e67e22 100%)" },
] as const;

export type ProfileColorId = typeof profileColors[number]["id"];

/** Default color (blue) — used for current user until color preferences are stored */
export const defaultProfileColor = profileColors[0];

/** Deterministically pick a color from a user ID string (for other users' avatars) */
export function getProfileColor(userId: string) {
  if (!userId || userId === "default") return profileColors[0];
  const lastChar = userId.charCodeAt(userId.length - 1);
  const index = lastChar % profileColors.length;
  return profileColors[index];
}
