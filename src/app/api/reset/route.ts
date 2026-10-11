import { getStore } from "@/lib/store";
import { fail, ok } from "@/lib/http";

// Reload the demo shop. Run this right before you go on stage.
export async function POST() {
  try {
    await getStore().reset();
    return ok({ reset: true });
  } catch (e) {
    return fail(e, 500);
  }
}
