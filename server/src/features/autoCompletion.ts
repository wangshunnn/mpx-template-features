import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  createConnection,
  TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { COMPLETION_KIND } from "../common/const";
import { mpxLocationMappingService } from "../common/mapping";

export async function useCompletion(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>
): Promise<void> {
  if (!connection) return;
  connection.onCompletion(completionProvider(documents));
  connection.onCompletionResolve(completionResolveProvider);
}

function completionProvider(documents: TextDocuments<TextDocument>) {
  return (
    _textDocumentPosition: TextDocumentPositionParams
  ): CompletionItem[] => {
    const document = documents.get(_textDocumentPosition.textDocument.uri);
    const uri = document?.uri;
    if (!document || !uri) return [];
    const { scriptMapping } = mpxLocationMappingService.get(uri) || {};
    if (!scriptMapping) return [];

    const completionList: CompletionItem[] = [];

    const { scriptDataMapping, setupDataMapping } = scriptMapping || {};

    if (scriptDataMapping) {
      const { data, computed, methods } = scriptDataMapping;
      for (const [label] of data) {
        completionList.push({
          label,
          kind: CompletionItemKind.Variable,
          data: COMPLETION_KIND.LEGACY_DATA_VARIABLE,
        });
      }
      for (const [label] of computed) {
        completionList.push({
          label,
          kind: CompletionItemKind.Variable,
          data: COMPLETION_KIND.LEGACY_COMPUTED_VARIABLE,
        });
      }
      for (const [label] of methods) {
        completionList.push({
          label,
          kind: CompletionItemKind.Function,
          data: COMPLETION_KIND.LEGACY_METHOD_FUNCTION,
        });
      }
    } else if (setupDataMapping) {
      const { defineProps, defineExpose } = setupDataMapping;
      for (const [label] of defineProps) {
        completionList.push({
          label,
          kind: CompletionItemKind.Variable,
          data: COMPLETION_KIND.SETUP_DEFINE_PROPS,
        });
      }
      for (const [label] of defineExpose) {
        completionList.push({
          label,
          kind: CompletionItemKind.Variable,
          data: COMPLETION_KIND.SETUP_DEFINE_EXPOSE,
        });
      }
    }

    return completionList;
  };
}

function completionResolveProvider(item: CompletionItem): CompletionItem {
  switch (item.data) {
    case COMPLETION_KIND.LEGACY_DATA_VARIABLE:
      item.detail = "data";
      item.documentation = "mpx props data";
      break;

    case COMPLETION_KIND.LEGACY_COMPUTED_VARIABLE:
      item.detail = "computed";
      item.documentation = "mpx computed data";
      break;

    case COMPLETION_KIND.LEGACY_METHOD_FUNCTION:
      item.detail = "method function";
      item.documentation = "mpx method function";
      break;

    case COMPLETION_KIND.SETUP_DEFINE_PROPS:
      item.detail = "defineProps";
      item.documentation = "mpx setup defineProps";
      break;

    case COMPLETION_KIND.SETUP_DEFINE_EXPOSE:
      item.detail = "defineExpose";
      item.documentation = "mpx setup defineExpose";
      break;

    case COMPLETION_KIND.STYLE_CLASS:
      item.detail = "style class";
      item.documentation = "mpx style class";
      break;

    default:
      break;
  }
  return item;
}
