import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/modules/types";

export interface RoleGateProps {
  /** Allowed roles. Empty or omitted: any staff role. */
  roles?: Role[];
  children: ReactNode;
  /** Rendered when the role is not allowed (default: nothing). */
  fallback?: ReactNode;
}

/** True when the signed-in staff role is in `roles` (any staff role when `roles` is empty). */
export function useHasRole(roles?: Role[]): boolean {
  const { role } = useAuth();
  if (!role) return false;
  return !roles || roles.length === 0 || roles.includes(role);
}

/** Renders children only for the given staff roles. UI only: the database enforces the same rule. */
export function RoleGate({ roles, children, fallback = null }: RoleGateProps) {
  return <>{useHasRole(roles) ? children : fallback}</>;
}

export default RoleGate;
