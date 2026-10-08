import { apiFailure, apiResponse, authenticatedClient, checkOrigin, readJson, rpcError, ApiError } from "@/lib/server";
import { validateAdminCommand } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { client } = await authenticatedClient();
    const profile = await client.rpc("app_bootstrap");
    if (profile.error) throw rpcError(profile.error);
    if (profile.data?.user?.role !== "admin") throw new ApiError("Hanya administrator yang dapat mengubah data.", 403);
    let command;
    try { command = validateAdminCommand(await readJson(request)); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Data tidak valid."); }
    const { data, error } = await client.rpc("admin_mutate", { p_command: command });
    if (error) throw rpcError(error);
    return apiResponse(data);
  } catch (error) { return apiFailure(error); }
}
