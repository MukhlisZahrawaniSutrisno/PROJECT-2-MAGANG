import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveMode } from "./config";

export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function serverClient() {
  if (resolveMode() !== "live") throw new ApiError("Layanan kantor belum dikonfigurasi.", 503);
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    { cookies: { getAll: () => store.getAll(), setAll: (items) => {
      for (const { name, value, options } of items) store.set(name, value, options);
    } } },
  );
}
export async function authenticatedClient() {
  const client = await serverClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ApiError("Silakan masuk dengan akun kantor terlebih dahulu.", 401);
  return { client, user: data.user };
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new ApiError("Permintaan tidak diizinkan.", 403);
}
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 64_000) throw new ApiError("Data terlalu besar.", 413);
  try { return JSON.parse(text); } catch { throw new ApiError("Format data tidak valid."); }
}
export function apiResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return apiResponse({ error: error.message }, error.status);
  return apiResponse({ error: "Permintaan belum berhasil. Coba lagi atau hubungi admin." }, 500);
}
export function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return new ApiError("Akun belum aktif atau Anda tidak memiliki akses.", 403);
  if (error.code === "22023" || error.code?.startsWith("23")) return new ApiError("Data tidak valid. Periksa PIC, keyword, SLA, dan tautan.", 400);
  return new ApiError("Database belum dapat memproses permintaan. Hubungi admin.", 503);
}

