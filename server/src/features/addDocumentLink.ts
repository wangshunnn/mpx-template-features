import { DocumentLink, createConnection, TextDocuments, DocumentLinkParams } from "vscode-languageserver/node";
import { Range, TextDocument } from "vscode-languageserver-textdocument";
import { mpxLocationMappingService } from "../common/mapping";
import { SCRIPT_CREATE_COMPONENT_PROPS, SETUP_GLOBAL_FUNCTION_NAME } from "../common/const";

const normalScriptFieldMap = new Map<SCRIPT_CREATE_COMPONENT_PROPS, string>([
  [SCRIPT_CREATE_COMPONENT_PROPS.COMPUTED, "computed"],
  [SCRIPT_CREATE_COMPONENT_PROPS.DATA, "computed"],
  [SCRIPT_CREATE_COMPONENT_PROPS.METHODS, "computed"],
  [SCRIPT_CREATE_COMPONENT_PROPS.SETUP, "computed"],
]);
const setupScriptFieldMap = new Map<SETUP_GLOBAL_FUNCTION_NAME, string>([
  [SETUP_GLOBAL_FUNCTION_NAME.DEFINE_PROPS, "defineProps"],
  [SETUP_GLOBAL_FUNCTION_NAME.DEFINE_EXPOSE, "defineExpose"],
]);

export function useDocumentLinks(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>,
): void {
  if (!connection) return;
  connection.onDocumentLinks(documentLinkProvider(documents));
  connection.onDocumentLinkResolve(documentLinkResolveProvider(documents));
}

function documentLinkProvider(
  documents: TextDocuments<TextDocument>,
): (param: DocumentLinkParams) => Promise<DocumentLink[] | null> {
  return async ({ textDocument }) => {
    const document = documents.get(textDocument.uri);
    const uri = document?.uri;
    if (!document || !uri) return null;
    const { templateMapping, scriptMapping, scriptJsonMapping } = (await mpxLocationMappingService.get(uri)) || {};
    if (!templateMapping) return null;

    const { tagMapping, variableMapping, rangeMapping } = templateMapping;

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

      rangeMapping.forEach((mapping) => {
        const { loc, key } = mapping;
        const componentMetadata = scriptJsonMapping.get(key);

        if (!componentMetadata) return;

        const link: DocumentLink = {
          target: componentMetadata.absolutePath,
          range: {
            start: document.positionAt(loc.start),
            end: document.positionAt(loc.end),
          },
          tooltip: "转到转到自定义组件文件: " + componentMetadata.configPath,
        };
        tagLinkList.push(link);
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
        const addVariableLink = (range: Range, tooltip: string) => {
          variableLinkList.push({
            range,
            tooltip,
          });
        };

        if (scriptDataMapping) {
          for (const [field, label] of normalScriptFieldMap) {
            const map = scriptDataMapping[field];

            if (map.has?.(key)) {
              addVariableLink(range, `转到 ${label} 定义`);
              break;
            }
          }
        } else if (setupDataMapping) {
          for (const [field, label] of setupScriptFieldMap) {
            const map = setupDataMapping[field];

            if (map.has?.(key)) {
              addVariableLink(range, `转到 ${label} 定义`);
              break;
            }
          }
        }
      });
    }

    return [...tagLinkList, ...variableLinkList];
  };
}

function documentLinkResolveProvider(
  documents: TextDocuments<TextDocument>,
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
