import { apiClient } from "./lancy/api-client";
import { dbOperations } from "./lancy/db-operations";
import { workflowEngine } from "./lancy/workflow-engine";
import { supervisorAgent } from "./lancy/supervisor-agent";
import { housekeeperAgent } from "./lancy/housekeeper-agent";
import { executeTool, LANCY_TOOLS } from "./lancy/tools";

export const lancyService = {
  ...apiClient,
  ...dbOperations,
  ...workflowEngine,
  ...supervisorAgent,
  ...housekeeperAgent,
};

export { LANCY_TOOLS, executeTool };
export type { MockShift } from "../db/supabase";
