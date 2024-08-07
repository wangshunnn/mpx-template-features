import { createConnection } from "vscode-languageserver/node";
import { mpxLocationMappingService } from "../common/mapping";

export function useOnRequest(
  connection: ReturnType<typeof createConnection>
): void {
  if (!connection) return;

  /** 视图拆分 */
  connection.onRequest("mpx/parseSfc", (uri: string) => {
    const { descriptor = {} } = mpxLocationMappingService.get(uri);
    return descriptor;
  });

  /** 切换文件 Tab 页面 */
  connection.onRequest("mpx/switchTabFile", (uri: string) => {
    sendRequestTokens(connection, uri);
  });
}

export function sendRequestTokens(
  connection: ReturnType<typeof createConnection>,
  uri: string
) {
  const { templateMapping, stylusMapping } = mpxLocationMappingService.get(uri);
  const styleTokens =
    templateMapping?.classLocationSort.filter(({ key }) =>
      stylusMapping?.has(key)
    ) || [];
  connection.sendRequest("mpx/tokens", {
    uri,
    tokens: { styleTokens },
  });
}
