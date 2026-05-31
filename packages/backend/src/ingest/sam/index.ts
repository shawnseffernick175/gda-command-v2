/**
 * SAM.gov ingest module — registers the SAM source with the framework.
 */

import { registerSource } from "../framework/registry";
import { runSAMIngest } from "./job";

export function registerSAMSource(): void {
  registerSource("sam.gov", "SAM.gov Opportunities", runSAMIngest);
}
