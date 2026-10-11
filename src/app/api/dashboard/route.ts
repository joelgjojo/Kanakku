import { dashboard } from "@/lib/analytics";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await dashboard());
  } catch (e) {
    return fail(e, 500);
  }
}
