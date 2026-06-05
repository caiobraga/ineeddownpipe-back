import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import {
  passwordResetEmailHtml,
  sendEmail,
  verificationEmailHtml,
} from "./email.js";

export type AppUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  createdAt: string;
};

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  password_hash: string;
  email_verified: boolean;
  verification_token: string | null;
  reset_token: string | null;
  reset_token_expiry: string | null;
  created_at: string;
};

const TOKEN_EXPIRY = "7d";

export function isAuthConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(process.env.JWT_SECRET);
}

export function authConfigStatus() {
  return {
    supabase: isSupabaseConfigured(),
    jwt: Boolean(process.env.JWT_SECRET),
    resend: Boolean(process.env.RESEND_API_KEY),
  };
}

export function mapAuthError(message: string): { status: number; error: string } {
  if (message === "Supabase is not configured") {
    return {
      status: 503,
      error: "Sign-up is unavailable — server database is not configured",
    };
  }
  if (
    message.includes("app_users") &&
    (message.includes("does not exist") || message.includes("schema cache"))
  ) {
    return {
      status: 503,
      error: "Sign-up is unavailable — run supabase/app_users.sql in Supabase",
    };
  }
  if (message === "User already exists") {
    return { status: 409, error: message };
  }
  if (message === "Invalid credentials") {
    return { status: 401, error: message };
  }
  return { status: 400, error: message };
}

function jwtSecret(): string {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error("JWT_SECRET is not configured");
  return v;
}

function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:5173").replace(/\/$/, "");
}

function toPublicUser(row: Pick<UserRow, "id" | "email" | "first_name" | "last_name" | "email_verified" | "created_at">): AppUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
  };
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return "Password must be at least 10 characters long";
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-={}\[\]\\|:;"'<>,.?/~]/.test(password);
  if (!(hasUpper && hasLower && hasDigit && hasSpecial)) {
    return "Password must include upper, lower, number, and special character";
  }
  return null;
}

export function signAuthToken(user: AppUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    jwtSecret(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

export async function requireAuthUser(
  authorization: string | undefined
): Promise<AppUser> {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  const token = authorization.slice("Bearer ".length).trim();
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, jwtSecret()) as jwt.JwtPayload;
  } catch {
    throw new Error("Unauthorized");
  }
  const userId = payload.userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Unauthorized");
  }
  const user = await getUserById(userId);
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function getUserByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as UserRow;
  return { ...toPublicUser(row), passwordHash: row.password_hash };
}

async function getUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, email, first_name, last_name, email_verified, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toPublicUser(data as UserRow);
}

export async function registerUser(params: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ token: string; user: AppUser }> {
  const email = params.email.trim().toLowerCase();
  const pwError = validatePassword(params.password);
  if (pwError) throw new Error(pwError);

  const existing = await getUserByEmail(email);
  if (existing) throw new Error("User already exists");

  const passwordHash = await bcrypt.hash(params.password, 12);
  const verificationToken = generateToken();

  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .insert({
      email,
      password_hash: passwordHash,
      first_name: params.firstName?.trim() || null,
      last_name: params.lastName?.trim() || null,
      email_verified: false,
      verification_token: verificationToken,
    })
    .select("id, email, first_name, last_name, email_verified, created_at")
    .single();

  if (error) throw new Error(error.message);
  const user = toPublicUser(data as UserRow);

  const verifyLink = `${siteUrl()}/?verify-email=${verificationToken}`;
  try {
    await sendEmail({
      to: email,
      subject: "Verify your iNeedDownpipe account",
      text: `Verify your email: ${verifyLink}`,
      html: verificationEmailHtml(verifyLink),
    });
  } catch (err) {
    console.error("[auth] verification email failed:", err);
  }

  return { token: signAuthToken(user), user };
}

export async function loginUser(params: {
  email: string;
  password: string;
}): Promise<{ token: string; user: AppUser }> {
  const user = await getUserByEmail(params.email.trim().toLowerCase());
  if (!user) throw new Error("Invalid credentials");

  const ok = await bcrypt.compare(params.password, user.passwordHash);
  if (!ok) throw new Error("Invalid credentials");

  const { passwordHash: _, ...publicUser } = user;
  return { token: signAuthToken(publicUser), user: publicUser };
}

export async function verifyEmailToken(token: string): Promise<AppUser> {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, email, first_name, last_name, email_verified, created_at")
    .eq("verification_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid verification token");

  const { error: updErr } = await getSupabaseAdmin()
    .from("app_users")
    .update({ email_verified: true, verification_token: null })
    .eq("id", (data as UserRow).id);
  if (updErr) throw new Error(updErr.message);

  return toPublicUser({ ...(data as UserRow), email_verified: true });
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;

  const row = data as UserRow;
  if (row.email_verified) return;

  const verificationToken = generateToken();
  const { error: updErr } = await getSupabaseAdmin()
    .from("app_users")
    .update({ verification_token: verificationToken })
    .eq("id", row.id);
  if (updErr) throw new Error(updErr.message);

  const verifyLink = `${siteUrl()}/?verify-email=${verificationToken}`;
  await sendEmail({
    to: row.email,
    subject: "Verify your iNeedDownpipe account",
    text: `Verify your email: ${verifyLink}`,
    html: verificationEmailHtml(verifyLink),
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;

  const row = data as UserRow;
  const resetToken = generateToken();
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error: updErr } = await getSupabaseAdmin()
    .from("app_users")
    .update({ reset_token: resetToken, reset_token_expiry: expiry })
    .eq("id", row.id);
  if (updErr) throw new Error(updErr.message);

  const resetLink = `${siteUrl()}/?reset-password=${resetToken}`;
  await sendEmail({
    to: row.email,
    subject: "Reset your iNeedDownpipe password",
    text: `Reset your password: ${resetLink}`,
    html: passwordResetEmailHtml(resetLink),
  });
}

export async function confirmPasswordReset(params: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const pwError = validatePassword(params.newPassword);
  if (pwError) throw new Error(pwError);

  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("*")
    .eq("reset_token", params.token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid or expired reset token");

  const row = data as UserRow;
  if (
    row.reset_token_expiry &&
    new Date(row.reset_token_expiry).getTime() < Date.now()
  ) {
    throw new Error("Invalid or expired reset token");
  }

  const passwordHash = await bcrypt.hash(params.newPassword, 12);
  const { error: updErr } = await getSupabaseAdmin()
    .from("app_users")
    .update({
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expiry: null,
    })
    .eq("id", row.id);
  if (updErr) throw new Error(updErr.message);
}
