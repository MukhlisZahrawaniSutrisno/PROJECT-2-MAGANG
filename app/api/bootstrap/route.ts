import { resolveMode } from "@/lib/config";
import { apiFailure, apiResponse, authenticatedClient, ApiError, rpcError } from "@/lib/server";

export async function GET() {
  try {
    const mode = resolveMode();
    if (mode === "demo") return apiResponse({ mode, user: null, data: null });
    if (mode === "unconfigured") throw new ApiError("Konfigurasi Supabase belum lengkap. Hubungi administrator.", 503);
    try {
      const { client } = await authenticatedClient();
      const { data, error } = await client.rpc("app_bootstrap");
      if (error) throw rpcError(error);
      return apiResponse({ mode, ...data });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return apiResponse({ mode, user: null, data: null });
      throw error;
    }
  } catch (error) { return apiFailure(error); }
}
