// TEMPORARY — error-capture verification trigger. Remove after rollout.
// Only the owner's own account can fire it; anyone else gets a silent no-op.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ERROR_TEST_ACCOUNT, errorTestMessage } from "./errorTest";

export const fireServerErrorTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ nonce: z.string().regex(/^[a-z0-9]{4,12}$/), birdId: z.string().uuid().optional() }))
  .handler(async ({ context, data }) => {
    if (context.userId !== ERROR_TEST_ACCOUNT) return { ok: false };
    const err = new Error(errorTestMessage("server"));
    err.name = `KyaErrorTestServer_${data.nonce}`;
    throw err;
  });
