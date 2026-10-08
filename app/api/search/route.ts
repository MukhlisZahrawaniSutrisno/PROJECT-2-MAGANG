import { apiFailure, apiResponse, authenticatedClient, checkOrigin, readJson, rpcError, ApiError } from "@/lib/server";
import { validateQuery } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const input = await readJson(request) as { query?: unknown; requestId?: unknown };
    let query: string;
    try { query = validateQuery(input?.query); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Masukkan masalah yang ingin dicari."); }
    if (typeof input?.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) throw new ApiError("Identitas pencarian tidak valid.");
    const { client } = await authenticatedClient();
    const { data, error } = await client.rpc("search_problems", { p_query: query, p_request_id: input.requestId });
    if (error) throw rpcError(error);
    return apiResponse(data);
  } catch (error) { return apiFailure(error); }
}
