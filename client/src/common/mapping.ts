import { MpxLocationMappingClientTokens } from "./types";

class MpxLocationMappingClient {
  private _tokens: MpxLocationMappingClientTokens = {};
  private _url = "";

  constructor() {}

  public get(uri: string) {
    if (uri !== this._url) return this._tokens;
  }

  public update(tokens: any, uri: string) {
    this._tokens = tokens;
    if (Array.isArray(this._tokens?.stylusPropsMapping)) {
      this._tokens.stylusPropsMapping = new Map(
        this._tokens.stylusPropsMapping
      );
    }
    this._url = uri;
  }
}

export const mpxLocationMappingClient = new MpxLocationMappingClient();
