import {
  Definition,
  TextDocumentPositionParams,
  TextDocuments,
  createConnection,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { MapLocation, MappingValue, MatrixLocation } from "../common/parse";
import { mpxLocationMappingService } from "../common/mapping";

export function useDefinition(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>
): void {
  if (!connection) return;
  connection.onDefinition(definitionProvider(documents));
}

function definitionProvider(
  documents: TextDocuments<TextDocument>
): (param: TextDocumentPositionParams) => Definition | null {
  return ({ textDocument, position }) => {
    const document: TextDocument | undefined = documents.get(textDocument.uri);
    const fileUri = document?.uri;
    if (!document || !fileUri) return null;

    console.log("===⬇ GoToDefinition:");
    const st_time = Date.now();
    const uri = document.uri.toString();
    const targetDefinition = findDefinition(
      document,
      uri,
      document.offsetAt(position)
    );
    const end_time = Date.now();
    console.log(
      "\tposition:",
      position,
      "\nmpxMappingService: ",
      mpxLocationMappingService.size,
      ",",
      [...mpxLocationMappingService.keys()]
    );
    console.log("===⬆", "cost-time: ", end_time - st_time, "\n");

    if (!targetDefinition) return null;
    return targetDefinition;
  };
}

export function findDefinition(
  document: TextDocument,
  uri: string,
  position: number
): Definition | null {
  const sfcMapping = mpxLocationMappingService.get(uri);
  const { templateMapping, scriptMapping, stylusMapping } = sfcMapping || {};
  if (
    !templateMapping ||
    position < templateMapping.loc?.start ||
    position > templateMapping.loc?.end
  ) {
    return null;
  }

  const findClassDefinition = binarySearch(
    templateMapping.classLocationSort,
    position
  );
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
  const findVarDefinition = binarySearch(
    templateMapping.variableLocationSort,
    position
  );
  if (findVarDefinition && scriptMapping) {
    const { key } = findVarDefinition;
    const loc: MapLocation | undefined =
      scriptMapping.dataMapping.get(key) ||
      scriptMapping.computedMapping.get(key) ||
      scriptMapping.methodsMapping.get(key);
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

export function binarySearch(
  arr: MappingValue[],
  target: number
): MappingValue | null {
  let left = 0,
    right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((right - left) / 2) + left;
    if (target >= arr[mid].loc.start && target <= arr[mid].loc.end) {
      return arr[mid];
    } else if (arr[mid].loc.end < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return null;
}
