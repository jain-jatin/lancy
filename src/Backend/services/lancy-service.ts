import { apiClient } from "./lancy/api-client";
import { dbOperations } from "./lancy/db-operations";
import { workflowEngine } from "./lancy/workflow-engine";
import { intelligentAgent, LANCY_TOOLS, executeTool } from "./lancy/intelligent-agent";

export const lancyService = {
  ...apiClient,
  ...dbOperations,
  ...workflowEngine,
  ...intelligentAgent,
};

export { LANCY_TOOLS, executeTool };
export type { MockShift } from "../db/supabase";
