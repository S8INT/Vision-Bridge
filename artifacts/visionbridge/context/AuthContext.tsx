/**
 * VisionBridge Auth Context
 *
 * Manages authentication state across the app:
 *  - JWT access token (in memory, refreshed automatically)
 *  - Refresh token (persisted in SecureStore)
 *  - User profile + permissions (RBAC)
 *  - MFA flow handling
 *  - Auto-refresh on expiry
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";

// ── Types ──────────────────────────────────────────────────────────────────────

export type UserRole = "Admin" | "Doctor" | "Technician" | "CHW" | "Viewer" | "Patient";

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  fullName: string;
  facility: string;
  district: string;
  phone?: string;
  isActive: boolean;
  mfaEnabled: boolean;
  dppaConsentAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export type Permission = Record<string, Record<string, boolean>>;

export type MfaChallenge = {
  sessionToken: string;
};

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  permissions: Permission | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mfaChallenge: MfaChallenge | null;
}

interface AuthActions {
  login: (email: string, password: string, deviceInfo?: DeviceInfo) => Promise<LoginResult>;
  register: (input: RegisterInput, deviceInfo?: DeviceInfo) => Promise<RegisterResult>;
  completeMfa: (code: string) => Promise<void>;
  logout: (allDevices?: boolean) => Promise<void>;
  refreshToken: () => Promise<boolean>;
  getAuthHeaders: () => Record<string, string>;
  can: (resource: string, action: string) => boolean;
}

export interface RegisterInput {
  email: string;
  password: string;
  role: Exclude<UserRole, "Admin">;
  fullName: string;
  facility: string;
  district: string;
  phone?: string;
  dppaConsent: true;
}

export type RegisterResult =
  | { success: true }
  | { success: false; error: string };

export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  devicePlatform?: string;
}

export type LoginResult =
  | { success: true; mfaRequired: false }
  | { success: true; mfaRequired: true }
  | { success: false; error: string };

type AuthContextValue = AuthState & AuthActions;

// ── Constants ──────────────────────────────────────────────────────────────────

const REFRESH_TOKEN_KEY = "vb_refresh_token";
const API_BASE = `${process.env["EXPO_PUBLIC_API_URL"] ?? ""}/api`;
const REFRESH_BUFFER_MS = 60_000; // refresh 1 minute before expiry

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    permissions: null,
    isLoading: true,
    isAuthenticated: false,
    mfaChallenge: null,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mfaSessionTokenRef = useRef<string | null>(null);

  // ── Token Refresh ──────────────────────────────────────────────────────────

  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const ms = Math.max(0, (expiresInSeconds * 1000) - REFRESH_BUFFER_MS);
    refreshTimerRef.current = setTimeout(() => {
      refreshToken().catch(console.error);
    }, ms);
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!stored) return false;

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored }),
      });

      if (!res.ok) {
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        setState((s) => ({ ...s, user: null, accessToken: null, isAuthenticated: false, isLoading: false }));
        return false;
      }

      const data = await res.json() as { accessToken: string; expiresIn: number };
      setState((s) => ({ ...s, accessToken: data.accessToken, isLoading: false }));
      scheduleRefresh(data.expiresIn);
      return true;
    } catch {
      return false;
    }
  }, [scheduleRefresh]);

  // ── Restore session on mount ───────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!stored) {
          setState((s) => ({ ...s, isLoading: false }));
          return;
        }

        const refreshOk = await refreshToken();
        if (!refreshOk) {
          setState((s) => ({ ...s, isLoading: false }));
          return;
        }

        // Fetch user profile
        const newToken = await getStoredAccessToken();
        if (!newToken) {
          setState((s) => ({ ...s, isLoading: false }));
          return;
        }

        const meRes = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        });

        if (meRes.ok) {
          const meData = await meRes.json() as { user: AuthUser; permissions: Permission };
          setState((s) => ({
            ...s,
            user: meData.user,
            permissions: meData.permissions,
            isAuthenticated: true,
            isLoading: false,
          }));
        } else {
          setState((s) => ({ ...s, isLoading: false }));
        }
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    })();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Workaround to read current accessToken in closure
  const accessTokenRef = useRef<string | null>(null);
  useEffect(() => { accessTokenRef.current = state.accessToken; }, [state.accessToken]);
  async function getStoredAccessToken() { return accessTokenRef.current; }

  // ── Login ──────────────────────────────────────────────────────────────────

  const login = useCallback(async (
    email: string,
    password: string,
    deviceInfo?: DeviceInfo,
  ): Promise<LoginResult> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          dppaConsent: true,
          deviceId: deviceInfo?.deviceId,
          deviceName: deviceInfo?.deviceName ?? "VisionBridge Mobile",
          devicePlatform: deviceInfo?.devicePlatform ?? "expo",
        }),
      });

      const data = await res.json() as {
        mfaRequired?: boolean;
        sessionToken?: string;
        accessToken?: string;
        refreshToken?: string;
        expiresIn?: number;
        user?: AuthUser;
        permissions?: Permission;
        error?: string;
      };

      if (!res.ok) {
        return { success: false, error: data.error ?? "Login failed" };
      }

      if (data.mfaRequired && data.sessionToken) {
        mfaSessionTokenRef.current = data.sessionToken;
        setState((s) => ({ ...s, mfaChallenge: { sessionToken: data.sessionToken! } }));
        return { success: true, mfaRequired: true };
      }

      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken!);
      setState((s) => ({
        ...s,
        accessToken: data.accessToken!,
        user: data.user!,
        permissions: data.permissions!,
        isAuthenticated: true,
        mfaChallenge: null,
      }));
      scheduleRefresh(data.expiresIn ?? 900);
      return { success: true, mfaRequired: false };
    } catch (err) {
      return { success: false, error: "Network error. Check your connection and try again." };
    }
  }, [scheduleRefresh]);

  // ── Register (self-service signup) ─────────────────────────────────────────

  const register = useCallback(async (
    input: RegisterInput,
    deviceInfo?: DeviceInfo,
  ): Promise<RegisterResult> => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          deviceId: deviceInfo?.deviceId,
          deviceName: deviceInfo?.deviceName ?? "VisionBridge Mobile",
          devicePlatform: deviceInfo?.devicePlatform ?? "expo",
        }),
      });

      const data = await res.json() as {
        accessToken?: string;
        refreshToken?: string;
        expiresIn?: number;
        user?: AuthUser;
        permissions?: Permission;
        error?: string;
      };

      if (!res.ok) {
        return { success: false, error: data.error ?? "Registration failed" };
      }

      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken!);
      setState((s) => ({
        ...s,
        accessToken: data.accessToken!,
        user: data.user!,
        permissions: data.permissions!,
        isAuthenticated: true,
        mfaChallenge: null,
      }));
      scheduleRefresh(data.expiresIn ?? 900);
      return { success: true };
    } catch (err) {
      return { success: false, error: "Network error. Check your connection and try again." };
    }
  }, [scheduleRefresh]);

  // ── MFA Completion ─────────────────────────────────────────────────────────

  const completeMfa = useCallback(async (code: string): Promise<void> => {
    const sessionToken = mfaSessionTokenRef.current;
    if (!sessionToken) throw new Error("No pending MFA challenge");

    const res = await fetch(`${API_BASE}/auth/mfa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, sessionToken }),
    });

    const data = await res.json() as {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      user?: AuthUser;
      permissions?: Permission;
      error?: string;
    };

    if (!res.ok) throw new Error(data.error ?? "MFA verification failed");

    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken!);
    mfaSessionTokenRef.current = null;

    setState((s) => ({
      ...s,
      accessToken: data.accessToken!,
      user: data.user!,
      permissions: data.permissions!,
      isAuthenticated: true,
      mfaChallenge: null,
    }));
    scheduleRefresh(data.expiresIn ?? 900);
  }, [scheduleRefresh]);

  // ── Logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async (allDevices = false): Promise<void> => {
    try {
      if (state.accessToken) {
        await fetch(`${API_BASE}/auth/logout${allDevices ? "?all=true" : ""}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${state.accessToken}` },
        });
      }
    } catch { /* best effort */ }

    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    setState({
      user: null,
      accessToken: null,
      permissions: null,
      isLoading: false,
      isAuthenticated: false,
      mfaChallenge: null,
    });
  }, [state.accessToken]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!state.accessToken) return {};
    return { Authorization: `Bearer ${state.accessToken}` };
  }, [state.accessToken]);

  const can = useCallback((resource: string, action: string): boolean => {
    return state.permissions?.[resource]?.[action] === true;
  }, [state.permissions]);

  // ── Context Value ──────────────────────────────────────────────────────────

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    completeMfa,
    logout,
    refreshToken,
    getAuthHeaders,
    can,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
