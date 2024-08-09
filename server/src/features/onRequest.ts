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
  const { templateMapping, stylusMapping, stylusPropsMapping } =
    mpxLocationMappingService.get(uri);
  const stylusTokensSorted =
    templateMapping?.classLocationSort.filter(({ key }) =>
      stylusMapping?.has(key)
    ) || [];

  // ! 注意通信数据不能是 Map, 需要转为数组
  connection.sendRequest("mpx/tokens", {
    uri,
    tokens: {
      stylusPropsMapping: Array.from(stylusPropsMapping || []),
      stylusTokensSorted,
    },
  });
}
