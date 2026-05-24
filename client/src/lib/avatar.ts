/**
 * WestPay — Avatar utility
 * Generates consistent, professional illustrated avatars using DiceBear API.
 * Each name always produces the same avatar (deterministic seed).
 * No API key required. Works as a plain <img src> URL.
 */

// Palette of soft background colors for avatars
const BG_COLORS = "b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,f9c74f,a8dadc,caffbf,ffc8dd";

/**
 * Returns a DiceBear avatar URL for a given name.
 * @param name - The merchant or admin name (used as seed)
 * @param size - Pixel size (default 128)
 */
export function getAvatarUrl(name: string, size = 128): string {
  const seed = encodeURIComponent((name || "user").trim());
  return `https://api.dicebear.com/9.x/lorelei/png?seed=${seed}&size=${size}&backgroundColor=${BG_COLORS}`;
}

/**
 * Returns initials (1-2 chars) from a name, used as fallback when image fails.
 */
export function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Generates a deterministic background color from a name string.
 * Used for initials fallback.
 */
export function getAvatarColor(name: string): string {
  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
    "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#06b6d4", "#3b82f6", "#00b050", "#d946ef",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
