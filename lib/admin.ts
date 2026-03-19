export const GUIDANCE_ADMIN_USERNAME = "nathancpark11";

export function isGuidanceAdminUsername(username: string | null | undefined) {
  return username?.trim().toLowerCase() === GUIDANCE_ADMIN_USERNAME;
}
