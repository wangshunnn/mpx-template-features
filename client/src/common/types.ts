export type MapLocation = { start: number; end: number };
export type MatrixLocation = { line: number; column: number };
export type MappingValue = { key: string; loc: MapLocation };
export type JsonMappingValue = {
  configPath: string;
  absolutePath?: string;
  relativePath?: string;
};
export type TemplateMappingItem = Map<string, MappingValue>;

export type TemplateMapping = {
  tagMapping: TemplateMappingItem;
  classMapping: TemplateMappingItem;
  variableMapping: TemplateMappingItem;
  tagLocationSort: MappingValue[];
  classLocationSort: MappingValue[];
  variableLocationSort: MappingValue[];
  loc: MapLocation;
} | null;

export type StylusMapping = Map<string, MatrixLocation[]>;
export type StylusPropsMapping = Map<
  string,
  Array<{ start: MatrixLocation; end: MatrixLocation }>
>;
export type ScriptJsonMapping = Map<string, JsonMappingValue>;
export type Template2ScriptMapping = Map<string, MapLocation>;
export type SFCMapping = {
  templateMapping: TemplateMapping | null;
  scriptMapping: any | null;
  stylusMapping: StylusMapping | null;
  stylusPropsMapping: StylusPropsMapping | null;
  scriptJsonMapping: ScriptJsonMapping | null;
};

/**
 * Tokens that receive from server
 */
export interface MpxLocationMappingClientTokens {
  templateMapping?: TemplateMapping;
  stylusPropsMapping?: StylusPropsMapping;
  stylusTokensSorted?: MappingValue[];
}
