import type { BackendRepositories } from "./types";
import { createFileRepositories } from "./file";
import { createSupabaseRepositories } from "./supabase";

export function createRepositories(): BackendRepositories {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (supabaseUrl && supabaseServiceRoleKey) {
    return createSupabaseRepositories({
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey
    });
  }

  if (process.env.MELLOWCAT_ALLOW_FILE_REPOSITORY?.trim().toLowerCase() !== "true") {
    console.warn(
      "[backend] Supabase repository is not configured. Falling back to file storage. Set MELLOWCAT_ALLOW_FILE_REPOSITORY=true only for local development."
    );
  }

  return createFileRepositories();
}
