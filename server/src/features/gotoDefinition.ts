import { Definition, TextDocumentPositionParams, TextDocuments, createConnection } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { MatrixLocation, reolveAbsolutePath } from "../common/parse";
import { mpxLocationMappingService } from "../common/mapping";
import path = require("path");
import { binarySearch, uriToFileName } from "../common/utils";
import { projectRootpathPromise } from "../server";
import { MapLocation } from '../common/types';

export async function useDefinition(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>,
): Promise<void> {
  if (!connection) return;
  const rooPath = await projectRootpathPromise;
  connection.onDefinition(definitionProvider(documents, rooPath));
}

function definitionProvider(
  documents: TextDocuments<TextDocument>,
  rooPath?: string,
): (param: TextDocumentPositionParams) => Promise<Definition | null> {
  return async ({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    const fileUri = document?.uri;
    if (!document || !fileUri) return null;

    const uri = document.uri.toString();
    const targetDefinition = findDefinition(document, uri, document.offsetAt(position), rooPath);

    if (!targetDefinition) return null;
    return targetDefinition;
  };
}

export async function findDefinition(
  document: TextDocument,
  uri: string,
  position: number,
  rooPath?: string,
): Promise<Definition | null> {
  const sfcMapping = await mpxLocationMappingService.get(uri);
  const { templateMapping, scriptMapping, stylusMapping, scriptJsonMapping } = sfcMapping || {};
  if (!templateMapping || position < templateMapping.loc?.start || position > templateMapping.loc?.end) {
    return null;
  }

  const findTagDefinition = binarySearch(templateMapping.tagLocationSort, position);
  if (findTagDefinition && scriptJsonMapping) {
    const { key } = findTagDefinition;
    const { absolutePath = "", relativePath = "" } = scriptJsonMapping.get(key) || {};
    if (absolutePath) {
      // 跳转其他文件
      return {
        uri: absolutePath,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      };
    } else {
      if (!rooPath) {
        return null;
      }
      let res = reolveAbsolutePath(path.join(uriToFileName(rooPath), relativePath));
      if (!res) {
        res = reolveAbsolutePath(path.join(uriToFileName(rooPath), "/node_modules/", relativePath));
      }
      if (res) {
        return {
          uri: res,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        };
      }
    }
    return null;
  }
  const findClassDefinition = binarySearch(templateMapping.classLocationSort, position);
  if (findClassDefinition && stylusMapping) {
    const { key } = findClassDefinition;
    const locList: MatrixLocation[] | undefined = stylusMapping.get(key);
    if (locList && locList.length > 0) {
      return locList.map((loc) => ({
        uri,
        range: {
          start: { line: loc.line - 1, character: loc.column - 1 },
          end: { line: loc.line - 1, character: loc.column + key.length },
        },
      }));
    }
    return null;
  }
  const findVarDefinition = binarySearch(templateMapping.variableLocationSort, position);
  if (findVarDefinition && scriptMapping) {
    const { key } = findVarDefinition;
    const loc: MapLocation | undefined =
      scriptMapping.scriptDataMapping?.data.get(key) ||
      scriptMapping.scriptDataMapping?.computed.get(key) ||
      scriptMapping.scriptDataMapping?.methods.get(key) ||
      scriptMapping.scriptDataMapping?.setup.get(key) ||
      scriptMapping.setupDataMapping?.defineProps.get(key) ||
      scriptMapping.setupDataMapping?.defineExpose.get(key);
    if (loc) {
      return {
        uri,
        range: {
          start: document.positionAt(loc.start),
          end: document.positionAt(loc.end),
        },
      };
    }
    return null;
  }
  return null;
}
