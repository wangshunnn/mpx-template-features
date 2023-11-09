/**
 * 一个文件对应一个 documentMapping
 */

import { LRUCache } from "vscode-languageserver";
import { SFCMapping, parseSFC } from "./parse";
import { TextDocument } from "vscode-languageserver-textdocument";

class MpxLocationMappingService extends LRUCache<string, SFCMapping> {
  constructor(capacity: number) {
    super(capacity);
  }

  public Initialize(uri: string): void {
    // console.log("---> [MpxLocationMappingService] Initialize", uri);
    this.get(uri);
  }

  public override get(uri: string): SFCMapping {
    const cachedMapping = super.get(uri);
    if (cachedMapping) {
      // console.log("---> [MpxLocationMappingService] Cached", uri);
      return cachedMapping;
    }
    const sfcMapping = parseSFC(uri);
    super.set(uri, sfcMapping);
    return sfcMapping;
  }

  public refresh(uri: string, document?: TextDocument): void {
    // console.log("---> [MpxLocationMappingService] refresh", uri);
    const sfcMapping = parseSFC(uri, document);
    super.set(uri, sfcMapping);
  }
}

export const mpxLocationMappingService = new MpxLocationMappingService(20);
