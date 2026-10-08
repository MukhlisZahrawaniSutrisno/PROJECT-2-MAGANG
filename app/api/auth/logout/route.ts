import { apiFailure, apiResponse, checkOrigin, serverClient } from "@/lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const client = await serverClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return apiResponse({ ok: true });
  } catch (error) { return apiFailure(error); }
}
