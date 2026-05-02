/**
 * useStaffDirectory — API-backed React Query hook for admin user management.
 *
 * All reads are served from the server (PostgreSQL via the API).
 * All writes invalidate the query cache so the list stays fresh.
 * This replaces the old AsyncStorage-based implementation in useProfile.ts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StaffRole = "Admin" | "Doctor" | "Technician" | "CHW" | "Viewer";

export interface StaffUser {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  role: StaffRole;
  facility: string;
  district: string;
  phone?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  dppaConsentAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreateStaffInput {
  fullName: string;
  email: string;
  password: string;
  role: StaffRole;
  facility: string;
  district: string;
  phone?: string;
}

export interface UpdateStaffInput {
  fullName?: string;
  role?: StaffRole;
  facility?: string;
  district?: string;
  phone?: string;
  isActive?: boolean;
}

// ── Query key ────────────────────────────────────────────────────────────────

export const STAFF_QUERY_KEY = ["staff"] as const;

// ── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(
  url: string,
  options: RequestInit & { authHeaders: Record<string, string> },
): Promise<Response> {
  const { authHeaders, ...rest } = options;
  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...rest.headers,
    },
  });
  return res;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useStaffDirectory() {
  const { getAuthHeaders } = useAuth();
  const queryClient = useQueryClient();
  const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;

  // ── List ──────────────────────────────────────────────────────────────────

  const query = useQuery<StaffUser[], Error>({
    queryKey: STAFF_QUERY_KEY,
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/auth/users`, {
        method: "GET",
        authHeaders: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await parseErrorMessage(res));
      const data = (await res.json()) as { users: StaffUser[] };
      return data.users;
    },
    staleTime: 30_000,
    retry: 2,
  });

  // ── Create ────────────────────────────────────────────────────────────────

  const createMutation = useMutation<StaffUser, Error, CreateStaffInput>({
    mutationFn: async (input) => {
      const res = await apiFetch(`${API_BASE}/auth/users`, {
        method: "POST",
        authHeaders: getAuthHeaders(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await parseErrorMessage(res));
      const data = (await res.json()) as { user: StaffUser };
      return data.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
    },
  });

  // ── Update ────────────────────────────────────────────────────────────────

  const updateMutation = useMutation<
    StaffUser,
    Error,
    { id: string; patch: UpdateStaffInput }
  >({
    mutationFn: async ({ id, patch }) => {
      const res = await apiFetch(`${API_BASE}/auth/users/${id}`, {
        method: "PATCH",
        authHeaders: getAuthHeaders(),
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await parseErrorMessage(res));
      const data = (await res.json()) as { user: StaffUser };
      return data.user;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<StaffUser[]>(STAFF_QUERY_KEY, (prev) =>
        prev?.map((u) => (u.id === updated.id ? updated : u)) ?? [updated],
      );
    },
  });

  // ── Remove (soft-delete) ──────────────────────────────────────────────────

  const removeMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await apiFetch(`${API_BASE}/auth/users/${id}`, {
        method: "DELETE",
        authHeaders: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await parseErrorMessage(res));
    },
    onSuccess: (_data, removedId) => {
      queryClient.setQueryData<StaffUser[]>(STAFF_QUERY_KEY, (prev) =>
        prev?.filter((u) => u.id !== removedId) ?? [],
      );
    },
  });

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    staff: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    createUser: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    resetCreateError: createMutation.reset,

    updateUser: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    resetUpdateError: updateMutation.reset,

    removeUser: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
    removeError: removeMutation.error,
  };
}
