import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@vx/core-uikit/types";
import {
  httpGet,
  httpPost,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  setUnauthorizedCallback,
  setTokenRefreshConfig,
} from "@vx/core-uikit/api";
import type { LoginCredentials, RegisterData, AuthTokens } from "../types";
import { authEndpoints } from "../config";

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  register: (data: RegisterData) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedCallback(logout);
    setTokenRefreshConfig({ url: authEndpoints.refresh });

    const token = getAuthToken();
    if (token) {
      httpGet<User>(authEndpoints.me)
        .then(setUser)
        .catch(() => {
          clearAuthToken();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [logout]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const tokens = await httpPost<AuthTokens>(authEndpoints.login, credentials);
    setAuthToken(tokens);
    const me = await httpGet<User>(authEndpoints.me);
    setUser(me);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const tokens = await httpPost<AuthTokens>(authEndpoints.register, data);
    setAuthToken(tokens);
    const me = await httpGet<User>(authEndpoints.me);
    setUser(me);
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
    register,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
