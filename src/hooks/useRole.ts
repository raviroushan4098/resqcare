import type { Role } from "@/lib/schemas";
import { useAuth } from "@/lib/auth/AuthProvider";

/** UI convenience only. The API enforces every permission; the UI just hides what a role cannot use. */
export function useRole() {
  const { me } = useAuth();
  const role: Role | null = me?.role ?? null;
  return {
    role,
    is: (...roles: Role[]) => !!role && roles.includes(role),
    hasPermission: (p: string) => me?.role === "hospital_admin" || !!me?.permissions.includes(p as never),
  };
}
