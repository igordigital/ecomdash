import { z } from "zod";

/** Worker/jobs environment. Validated once at process start. */
export const workerEnv = z.object({
  DATABASE_URL: z.string().url(),
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v21.0"),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),
  GA4_SERVICE_ACCOUNT_JSON: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  REVALIDATE_SECRET: z.string().optional(),
});
export type WorkerEnv = z.infer<typeof workerEnv>;

type EnvSource = Record<string, string | undefined>;

function processEnv(): EnvSource {
  return (globalThis as { process?: { env: EnvSource } }).process?.env ?? {};
}

export function loadWorkerEnv(source: EnvSource = processEnv()): WorkerEnv {
  return workerEnv.parse(source);
}
