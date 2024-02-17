import { createConnection } from "vscode-languageserver/node";
import { mpxLocationMappingService } from "../common/mapping";

export function useSplitEditors(
  connection: ReturnType<typeof createConnection>,
): void {
  if (!connection) return;
  connection.onRequest("mpx/parseSfc", (uri: string) => {
    const { descriptor = {} } = mpxLocationMappingService.get(uri);
    return descriptor;
  });
}
