import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  createConnection,
} from "vscode-languageserver/node";
import { COMPLETION_DATA_TYPE } from "../common/const";

export function useCompletion(
  connection: ReturnType<typeof createConnection>
): void {
  if (!connection) return;

  connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
      return [
        {
          label: "pData",
          kind: CompletionItemKind.Text,
          data: COMPLETION_DATA_TYPE.DATA_VARIABLE,
        },
        {
          label: "soonClick",
          kind: CompletionItemKind.Function,
          data: COMPLETION_DATA_TYPE.METHOD_FUNCTION,
        },
        {
          label: "soon-class",
          kind: CompletionItemKind.Text,
          data: COMPLETION_DATA_TYPE.STYLE_CLASS,
        },
      ];
    }
  );

  connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    switch (item.data) {
      case COMPLETION_DATA_TYPE.DATA_VARIABLE:
        item.detail = "data";
        item.documentation = "mpx props data";
        break;

      case COMPLETION_DATA_TYPE.COMPUTED_VARIABLE:
        item.detail = "computed";
        item.documentation = "mpx computed data";
        break;

      case COMPLETION_DATA_TYPE.METHOD_FUNCTION:
        item.detail = "method function";
        item.documentation = "mpx method function";
        break;

      case COMPLETION_DATA_TYPE.STYLE_CLASS:
        item.detail = "style class";
        item.documentation = "mpx style class";
        break;

      default:
        break;
    }
    return item;
  });
}
