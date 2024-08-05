import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  createConnection,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { COMPLETION_DATA_TYPE } from "../common/const";
import { mpxLocationMappingService } from "../common/mapping";

export async function useCompletion(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>
): Promise<void> {
  if (!connection) return;

  connection.onCompletion(
    (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
      console.log("[shun] --->", _textDocumentPosition);
      const document = documents.get(_textDocumentPosition.textDocument.uri);
      const uri = document?.uri;
      if (!document || !uri) return [];
      const { scriptMapping } = mpxLocationMappingService.get(uri) || {};
      if (!scriptMapping) return [];

      const completionList: CompletionItem[] = [];

      for (const [label] of scriptMapping.dataMapping) {
        completionList.push({
          label,
          kind: CompletionItemKind.Variable,
          data: COMPLETION_DATA_TYPE.DATA_VARIABLE,
        });
      }
      for (const [label] of scriptMapping.computedMapping) {
        completionList.push({
          label,
          kind: CompletionItemKind.Variable,
          data: COMPLETION_DATA_TYPE.COMPUTED_VARIABLE,
        });
      }
      for (const [label] of scriptMapping.methodsMapping) {
        completionList.push({
          label,
          kind: CompletionItemKind.Function,
          data: COMPLETION_DATA_TYPE.METHOD_FUNCTION,
        });
      }

      return completionList;
    }
  );

  connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    switch (item.data) {
      // case COMPLETION_DATA_TYPE.DATA_VARIABLE:
      //   item.detail = "data";
      //   item.documentation = "mpx props data";
      //   break;

      // case COMPLETION_DATA_TYPE.COMPUTED_VARIABLE:
      //   item.detail = "computed";
      //   item.documentation = "mpx computed data";
      //   break;

      // case COMPLETION_DATA_TYPE.METHOD_FUNCTION:
      //   item.detail = "method function";
      //   item.documentation = "mpx method function";
      //   break;

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

// function createCompletionElement(params: any) {}
