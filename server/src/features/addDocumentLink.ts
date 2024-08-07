import {
  DocumentLink,
  createConnection,
  TextDocuments,
  DocumentLinkParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { mpxLocationMappingService } from "../common/mapping";

export function useDocumentLinks(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>
): void {
  if (!connection) return;
  connection.onDocumentLinks(documentLinkProvider(documents));
  connection.onDocumentLinkResolve(documentLinkResolveProvider(documents));
}

function documentLinkProvider(
  documents: TextDocuments<TextDocument>
): (param: DocumentLinkParams) => DocumentLink[] | null {
  return ({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    const uri = document?.uri;
    if (!document || !uri) return null;
    const { templateMapping, scriptMapping, scriptJsonMapping } =
      mpxLocationMappingService.get(uri) || {};
    if (!templateMapping) return null;

    const { tagMapping, variableMapping } = templateMapping;

    const tagLinkList: DocumentLink[] = [];
    if (scriptJsonMapping) {
      [...tagMapping.entries()].forEach(([_key, v]) => {
        const key = _key.substring(0, _key.lastIndexOf("-"));
        if (scriptJsonMapping.has(key)) {
          const { loc } = v;
          const { configPath, absolutePath } = scriptJsonMapping.get(key)!;
          const link: DocumentLink = {
            target: absolutePath,
            range: {
              start: document.positionAt(loc.start),
              end: document.positionAt(loc.end),
            },
            tooltip: "转到自定义组件文件：" + configPath,
          };
          tagLinkList.push(link);
        }
      });
    }

    // const classLinkList: DocumentLink[] = [];
    // if (stylusMapping) {
    //   [...classMapping.entries()].forEach(([_key, v]) => {
    //     const key = _key.substring(0, _key.lastIndexOf("-"));
    //     if (stylusMapping.has(key)) {
    //       const { loc } = v;
    //       const link: DocumentLink = {
    //         range: {
    //           start: document.positionAt(loc.start),
    //           end: document.positionAt(loc.end),
    //         },
    //         tooltip: "转到 style 中的样式",
    //       };
    //       classLinkList.push(link);
    //     }
    //   });
    // }

    const variableLinkList: DocumentLink[] = [];
    if (scriptMapping) {
      const { scriptDataMapping, setupDataMapping } = scriptMapping || {};
      // const {data} = scriptDataMapping
      [...variableMapping.entries()].forEach(([_key, v]) => {
        const key = _key.substring(0, _key.lastIndexOf("-"));
        const { loc } = v;
        const range = {
          start: document.positionAt(loc.start),
          end: document.positionAt(loc.end),
        };

        if (scriptDataMapping) {
          const { data, computed, methods } = scriptDataMapping;
          if (data.has?.(key)) {
            variableLinkList.push({
              tooltip: "转到 data 定义",
              range,
            });
          } else if (computed.has?.(key)) {
            variableLinkList.push({
              tooltip: "转到 computed 定义",
              range,
            });
          } else if (methods.has?.(key)) {
            variableLinkList.push({
              tooltip: "转到 methods 定义",
              range,
            });
          }
        } else if (setupDataMapping) {
          const { defineProps, defineExpose } = setupDataMapping;
          if (defineProps.has?.(key)) {
            variableLinkList.push({
              tooltip: "转到 defineProps 定义",
              range,
            });
          } else if (defineExpose.has?.(key)) {
            variableLinkList.push({
              tooltip: "转到 defineExpose 定义",
              range,
            });
          }
        }
      });
    }

    return [...tagLinkList, ...variableLinkList];
  };
}

function documentLinkResolveProvider(
  documents: TextDocuments<TextDocument>
): (param: DocumentLink) => DocumentLink | null {
  return (_item: DocumentLink) => {
    // if (!myDocument) return null;
    // return {
    //   range: {
    //     start: myDocument.positionAt(100),
    //       end: myDocument.positionAt(103),
    //   },
    // };
    return null;
  };
}
