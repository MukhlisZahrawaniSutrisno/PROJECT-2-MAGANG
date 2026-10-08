import { apiFailure, apiResponse, checkOrigin, readJson, serverClient, ApiError } from "@/lib/server";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = await readJson(request) as { email?: unknown };
    if (typeof input?.email !== "string" || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new ApiError("Masukkan email kantor yang valid.");
    const client = await serverClient();
    const { error } = await client.auth.signInWithOtp({ email: input.email.trim(), options: { shouldCreateUser: false } });
    if (error) throw new ApiError("Kode belum dapat dikirim. Pastikan akun sudah diundang, atau coba lagi nanti.", 400);
    return apiResponse({ message: "Kode masuk dikirim ke email Anda." });
  } catch (error) { return apiFailure(error); }
}
