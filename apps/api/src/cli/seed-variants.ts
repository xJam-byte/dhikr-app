// apps/api/src/cli/seed-variants.ts
import "dotenv/config";
import { seedBasicVariants } from "../zikr-variants/zikr-variants.seed";

seedBasicVariants()
  .then(() => {
    console.log("✅ seed CLI finished");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ seed CLI error", e);
    process.exit(1);
  });
