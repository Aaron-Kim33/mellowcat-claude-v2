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

  return createFileRepositories();
}
