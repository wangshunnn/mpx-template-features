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
    const { templateMapping } = mpxLocationMappingService.get(uri) || {};
    if (!templateMapping) return null;
    const { classMapping, variableMapping } = templateMapping;
    const classLinkList = [...classMapping.entries()].map(([, v]) => {
      const { loc } = v;
      const link: DocumentLink = {
        range: {
          start: document.positionAt(loc.start),
          end: document.positionAt(loc.end),
        },
        tooltip: "转到 style 中的样式",
      };
      return link;
    });
    const variableLinkList = [...variableMapping.entries()].map(([, v]) => {
      const { loc } = v;
      const link: DocumentLink = {
        range: {
          start: document.positionAt(loc.start),
          end: document.positionAt(loc.end),
        },
        tooltip: "转到 script 中的定义",
      };
      return link;
    });
    return [...classLinkList, ...variableLinkList];
  };
}

function documentLinkResolveProvider(
  documents: TextDocuments<TextDocument>
): (param: DocumentLink) => DocumentLink | null {
  return (_item: DocumentLink) => {
    // if (!myDocument) return null;
    // console.log("---> documentLinkResolveProvider", item);
    // return {
    //   range: {
    //     start: myDocument.positionAt(100),
    //       end: myDocument.positionAt(103),
    //   },
    // };
    return null;
  };
}
