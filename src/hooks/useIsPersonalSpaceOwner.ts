import { useAuthStore } from "@/stores/useAuthStore";
import { isOwnPersonalSpace, useSpaceStore } from "@/stores/useSpaceStore";

/**
 * True when the current space is the signed-in user's own personal space.
 * In that space the owner has full rights regardless of their global role.
 */
export function useIsPersonalSpaceOwner(): boolean {
  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const space = spaces.find((item) => item.id === currentSpaceId) ?? null;
  return isOwnPersonalSpace(space, userId);
}
