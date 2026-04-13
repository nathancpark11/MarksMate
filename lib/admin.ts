function getAdminUsername(): string {
  return (process.env.ADMIN_USERNAME ?? "").trim().toLowerCase();
}

export function isGuidanceAdminUsername(username: string | null | undefined) {
  const adminUsername = getAdminUsername();
  if (!adminUsername) return false;
  return username?.trim().toLowerCase() === adminUsername;
}
