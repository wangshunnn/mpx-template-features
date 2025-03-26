/**
 * 一个文件对应一个 documentMapping
 */

import { LRUCache } from "vscode-languageserver";
import { SFCMapping, parseSFC } from "./parse";
import { TextDocument } from "vscode-languageserver-textdocument";

class MpxLocationMappingService {
  cache!: LRUCache<string, Promise<SFCMapping> | SFCMapping>;
  constructor(capacity: number) {
    this.cache = new LRUCache<string, Promise<SFCMapping> | SFCMapping>(capacity);
  }

  public Initialize(uri: string): void {
    this.get(uri);
  }

  public async get(uri: string): Promise<SFCMapping> {
    const cachedMapping = this.cache.get(uri);
    if (cachedMapping) {
      return cachedMapping;
    }
    const sfcMapping = parseSFC(uri);

    this.cache.set(uri, sfcMapping);

    return sfcMapping;
  }

  public async refresh(uri: string, document?: TextDocument) {
    const sfcMapping = parseSFC(uri, document);
    this.cache.set(uri, sfcMapping);
  }
}

export const mpxLocationMappingService = new MpxLocationMappingService(20);
