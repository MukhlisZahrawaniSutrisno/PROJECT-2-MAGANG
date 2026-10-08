import { apiFailure, apiResponse, checkOrigin, readJson, serverClient, ApiError } from "@/lib/server";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = await readJson(request) as { email?: unknown; token?: unknown };
    if (typeof input?.email !== "string" || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || typeof input.token !== "string" || !/^\d{6,8}$/.test(input.token)) throw new ApiError("Email atau kode masuk tidak valid.");
    const client = await serverClient();
    const { error } = await client.auth.verifyOtp({ email: input.email.trim(), token: input.token, type: "email" });
    if (error) throw new ApiError("Kode salah atau kedaluwarsa. Minta kode baru.", 400);
    const profile = await client.rpc("app_bootstrap");
    if (profile.error || !profile.data?.user) {
      await client.auth.signOut();
      throw new ApiError("Akun Anda belum diaktifkan oleh admin.", 403);
    }
    return apiResponse({ ok: true });
  } catch (error) { return apiFailure(error); }
}
