import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(8).max(200),
  displayName: z.string().max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const apiKeyCreateSchema = z.object({
  name: z.string().max(200).optional(),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  googleSub: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string | null;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult extends AuthTokens {
  user: User;
}
