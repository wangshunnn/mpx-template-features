import type {
  CallExpression,
  ExpressionStatement,
  ObjectExpression,
} from "@babel/types";
import {
  CompilerError,
  compileScript,
  parse as compileSFC,
  compileTemplate,
  type SFCDescriptor,
} from "@vue/compiler-sfc";
import type { RootNode, TemplateChildNode } from "@vue/compiler-core";
import * as fs from "fs";
import * as path from "path";
import * as stylus from "stylus";
import { TextDocument } from "vscode-languageserver-textdocument";
import { uriToFileName } from "./utils";

export type MapLocation = { start: number; end: number };
export type MatrixLocation = { line: number; column: number };
export type MappingValue = { key: string; loc: MapLocation };
export type JsonMappingValue = {
  configPath: string;
  absolutePath?: string;
  relativePath?: string;
};
export type TemplateMappingItem = Map<string, MappingValue>;
export type ScriptMappingItem = Map<string, MapLocation>;
export type TemplateMapping = {
  tagMapping: TemplateMappingItem;
  classMapping: TemplateMappingItem;
  variableMapping: TemplateMappingItem;
  tagLocationSort: MappingValue[];
  classLocationSort: MappingValue[];
  variableLocationSort: MappingValue[];
  loc: MapLocation;
} | null;
export type ScriptMapping = {
  dataMapping: ScriptMappingItem;
  computedMapping: ScriptMappingItem;
  methodsMapping: ScriptMappingItem;
} | null;
export type StylusMapping = Map<string, MatrixLocation[]>;
export type ScriptJsonMapping = Map<string, JsonMappingValue>;
export type Template2ScriptMapping = Map<string, MapLocation>;
export type SFCMapping = {
  templateMapping: TemplateMapping | null;
  scriptMapping: ScriptMapping | null;
  stylusMapping: StylusMapping | null;
  scriptJsonMapping: ScriptJsonMapping | null;
  template2ScriptMapping: Template2ScriptMapping | null;
  descriptor: SFCDescriptor | null;
};

export function parseSFC(uri: string, document?: TextDocument): SFCMapping {
  try {
    let fileContent;
    if (document) {
      fileContent = document.getText();
    } else {
      fileContent = fs.readFileSync(uriToFileName(uri), "utf8");
    }
    const compileSFCResult = compileSFC(fileContent);
    const { descriptor, errors } = compileSFCResult;
    const templateMapping = parseTemplate(descriptor, uri);
    const scriptMapping = parseScriptlang(descriptor, uri);
    const stylusMapping = parseStylus(descriptor, uri);
    const scriptJsonMapping = parseScriptJson(
      descriptor,
      errors as CompilerError[],
      uri
    );
    const template2ScriptMapping = genTemplate2ScriptMapping(
      templateMapping?.variableMapping,
      scriptMapping
    );
    const sfcMapping = {
      templateMapping,
      scriptMapping,
      stylusMapping,
      scriptJsonMapping,
      template2ScriptMapping,
      descriptor,
    };
    return sfcMapping;
  } catch (err) {
    console.error("!!! ---> parseSFC error: ", err);
    return {
      templateMapping: null,
      scriptMapping: null,
      stylusMapping: null,
      scriptJsonMapping: null,
      template2ScriptMapping: null,
      descriptor: null,
    };
  }
}

export const ignorePropList = ["wx:key", "wx:ref"];
export const ignoreTagList = ["template", "view", "image", "text", "block"];

export function parseTemplate(descriptor: SFCDescriptor, uri: string) {
  if (!descriptor.template?.content) return null;
  const compileTemplateResult = compileTemplate({
    source: descriptor.template?.ast?.loc?.source,
    filename: uri,
    id: uri + "_mpx_template_",
  });
  const tagMapping = new Map<string, MappingValue>();
  const classMapping = new Map<string, MappingValue>();
  const variableMapping = new Map<string, MappingValue>();
  const templateLoc = {
    start: descriptor.template.ast.loc?.start?.offset + 1,
    end: descriptor.template.ast.loc?.end?.offset + 1,
  };

  // fs.writeFileSync(
  //   uriToFileName(uri).replace(".mpx", "-temp.json"),
  //   JSON.stringify(compileTemplateResult, null, 2)
  // );

  function traverseTemplate(ast: RootNode) {
    if (!ast || !ast.children) return null;
    // dfs 深度优先好处可以保证位置顺序递增
    function dfsTraverseChildren(children: TemplateChildNode[]) {
      for (const child of children) {
        if (child.type === 1) {
          // 自定义标签
          if (child?.tag && !ignoreTagList.includes(child.tag)) {
            const key = child.tag;
            const locStart = child.loc.start.offset + templateLoc.start;
            tagMapping.set(key + "-" + locStart, {
              key,
              loc: {
                start: locStart,
                end: locStart + key.length,
              },
            });
          }
          // 标签属性
          if (child.props?.length > 0) {
            for (const prop of child.props) {
              if (!("value" in prop)) {
                continue;
              }
              if (prop.name === "class") {
                const content = JSON.parse(prop.value?.loc?.source + "");
                const _loc = prop.value?.loc;
                const [key = "", offset = 0] = formatCotent(content);
                if (key && _loc?.start?.offset) {
                  const locStart =
                    _loc.start.offset + offset + templateLoc.start;
                  classMapping.set(key + "-" + locStart, {
                    key,
                    loc: {
                      start: locStart,
                      end: locStart + key.length,
                    },
                  });
                }
              } else if (
                prop.name.startsWith("bind") ||
                prop.name.startsWith("catch") ||
                prop.value?.content.includes("{{")
              ) {
                const content = prop.value?.content;
                const _loc = prop.value?.loc;
                const [key = "", offset = 0] = formatCotent(content);
                if (key && _loc?.start?.offset) {
                  const locStart =
                    _loc.start.offset + offset + templateLoc.start;
                  variableMapping.set(key + "-" + locStart, {
                    key,
                    loc: {
                      start: locStart,
                      end: locStart + key.length,
                    },
                  });
                }
              }
            }
          }
          if (child.children) {
            dfsTraverseChildren(child.children);
          }
        }
      }
    }
    dfsTraverseChildren(ast.children);
  }

  try {
    traverseTemplate(compileTemplateResult.ast!);
  } catch (err) {
    console.error("---> traverseTemplate error: ", err);
  }

  const tagLocationSort = [...tagMapping.entries()].map(([, v]) => v);
  const classLocationSort = [...classMapping.entries()].map(([, v]) => v);
  const variableLocationSort = [...variableMapping.entries()].map(([, v]) => v);
  // console.log("---> parseTemplate: ", tagMapping.keys(), tagLocationSort);
  return {
    tagMapping,
    classMapping,
    variableMapping,
    tagLocationSort,
    classLocationSort,
    variableLocationSort,
    loc: templateLoc,
  };
}

// TODO 增加对复杂表达式的解析
export function formatCotent(content = ""): [string, number] | [] {
  if (!content) return [];
  let key = content.trim();
  if (key.startsWith("{{") && key.endsWith("}}")) {
    key = key.slice(2, -2).trim();
  }
  if (
    key.startsWith("'") ||
    key.startsWith('"') ||
    ["true", "false"].includes(key)
  ) {
    return ["", 0];
  }
  if (key.startsWith("!") || key.startsWith("+")) {
    key = key.slice(1);
  }
  if (key.includes(".")) {
    key = key.split(".")[0];
  }
  if (key.includes("(")) {
    key = key.split("(")[0];
  }
  if (key.includes("[")) {
    key = key.split("[")[0];
  }
  const offset = content.indexOf(key);
  return [key, offset];
}

export function hasScriptLang(descriptor: SFCDescriptor) {
  return descriptor.scriptSetup || !getJsonScriptType(descriptor);
}

export const JSON_SCRIPT_TYPE = {
  NAME_JSON: "name-json",
  TYPE_JSON: "type-json",
} as const;
export type ValueOf<T> = T[keyof T];

export function getJsonScriptType(
  descriptor: SFCDescriptor
): ValueOf<typeof JSON_SCRIPT_TYPE> | null {
  if ((descriptor.script?.attrs?.name + "").toLowerCase().includes("json")) {
    return JSON_SCRIPT_TYPE.NAME_JSON;
  } else if (
    (descriptor.script?.attrs?.type + "").toLowerCase().includes("json")
  ) {
    return JSON_SCRIPT_TYPE.TYPE_JSON;
  } else {
    return null;
  }
}

export function parseScriptlang(descriptor: SFCDescriptor, uri: string) {
  if (!hasScriptLang) return null;

  if (descriptor.scriptSetup) {
    return null;
    // return parseScriptSetup(descriptor, uri);
  }
  return parseScriptLegacy(descriptor, uri);
}

export function parseScriptLegacy(descriptor: SFCDescriptor, uri: string) {
  const compileScriptResult = compileScript(descriptor, { id: uri });
  const component = compileScriptResult.scriptAst?.find(
    (item) =>
      item.type === "ExpressionStatement" &&
      item.expression.type === "CallExpression" &&
      item.expression.callee.type === "Identifier" &&
      ["createPage", "createComponent"].includes(item.expression.callee.name)
  );
  if (!component) return null;
  const componentExpression = (component as ExpressionStatement)
    .expression as CallExpression;
  const scriptOffset = compileScriptResult.loc.start.offset;
  const dataMapping = new Map<string, MapLocation>();

  // traverse(compileScriptResult.scriptAst, )
  for (const prop of (componentExpression.arguments[0] as ObjectExpression)
    .properties) {
    if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
      switch (prop.key.name) {
        case "properties":
        case "data": {
          if (prop.value.type === "ObjectExpression") {
            const dataExpression = prop.value.properties;
            dataExpression.forEach((item) => {
              if (item.type === "ObjectProperty") {
                if (item.key.type === "Identifier") {
                  const dataKey = item.key.name;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset,
                    end: item.key.end! + scriptOffset,
                  };
                  dataMapping.set(dataKey, dataLoc);
                } else if (item.key.type === "StringLiteral") {
                  const dataKey = item.key.value;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset + 1,
                    end: item.key.end! + scriptOffset - 1,
                  };
                  dataMapping.set(dataKey, dataLoc);
                } else {
                  console.warn("----> warning: ", item.key.type);
                }
              }
            });
          }
          break;
        }
        case "computed":
        case "methods": {
          if (prop.value.type === "ObjectExpression") {
            const methodsProps = prop.value.properties;
            methodsProps.forEach((item) => {
              if (item.type === "SpreadElement") {
                if (
                  item.argument.type === "CallExpression" &&
                  item.argument.callee.type === "MemberExpression" &&
                  item.argument.callee.property.type === "Identifier" &&
                  [
                    "mapState",
                    "mapMutations",
                    "mapActions",
                    "mapGetters",
                  ].includes(item.argument.callee.property.name)
                ) {
                  if (item.argument.arguments[0].type === "ArrayExpression") {
                    const elements = item.argument.arguments[0].elements;
                    elements.forEach((element) => {
                      if (element?.type === "StringLiteral") {
                        const dataKey = element.value;
                        const dataLoc = {
                          start: element.start! + scriptOffset + 1,
                          end: element.end! + scriptOffset - 1,
                        };
                        dataMapping.set(dataKey, dataLoc);
                      }
                    });
                  }
                }
              } else if (item.type === "ObjectMethod") {
                if (item.key.type === "Identifier") {
                  const dataKey = item.key.name;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset,
                    end: item.key.end! + scriptOffset,
                  };
                  dataMapping.set(dataKey, dataLoc);
                }
              } else {
                console.warn("----> warning: ", item.type);
              }
            });
          }
          break;
        }
        default:
          break;
      }
    }
  }
  // console.log("---> dataMapping: ", dataMapping.keys());
  const computedMapping = new Map<string, MapLocation>();
  const methodsMapping = new Map<string, MapLocation>();
  return { dataMapping, computedMapping, methodsMapping };
}

export function parseScriptSetup(descriptor: SFCDescriptor, uri?: string) {
  const setupMapping = new Map<string, MapLocation>();
  return setupMapping;
}

export function parseStylus(descriptor: SFCDescriptor, uri?: string) {
  const stylusMapping = new Map<string, MatrixLocation[]>();
  if (descriptor.styles?.[0]?.lang !== "stylus") {
    return stylusMapping;
  }
  const styles = descriptor.styles[0];
  const stylusMatrixLoc = {
    line: styles.loc?.start?.line,
    column: styles.loc?.start?.column,
  };

  function dfsTraverseStylusNode(nodes: any) {
    if (!nodes.length) return null;
    for (const node of nodes) {
      if (node.nodes?.length > 0) {
        const segments = node.nodes[0]?.segments || [];
        if (
          segments.length >= 2 &&
          segments[0]?.string === "." &&
          segments[1]?.string
        ) {
          const item = segments[1];
          const key = item.string || item.val;
          if (!key) continue;
          const loc = {
            line: item.lineno + stylusMatrixLoc.line - 1,
            column: item.column - 1,
          };
          if (stylusMapping.has(key)) {
            stylusMapping.get(key)?.push(loc);
          } else {
            stylusMapping.set(key, [loc]);
          }
        }
      }
      if (node.block?.nodes?.length > 0) {
        dfsTraverseStylusNode(node.block.nodes);
      }
    }
  }
  try {
    const styleSource = descriptor.styles[0].content;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const compileStylusResult = new stylus.Parser(styleSource).parse();
    dfsTraverseStylusNode(compileStylusResult?.nodes);
  } catch (err) {
    console.error("---> traverseStylus error: ", err);
  }
  // console.log("---> stylusMapping", [...stylusMapping.keys()]);
  return stylusMapping;
}

export function parseScriptJson(
  descriptor: SFCDescriptor,
  errors: CompilerError[],
  uri: string
) {
  const jsonMapping = new Map<string, JsonMappingValue>();
  try {
    let jsonSource: string;
    let jsonScriptType = getJsonScriptType(descriptor);
    if (jsonScriptType) {
      jsonSource = descriptor.script?.loc?.source as string;
    } else if (errors?.length) {
      const jsonDescriptor = errors.find(
        (item: any) =>
          item?.loc?.source?.startsWith('<script name="json">') ||
          item?.loc?.source?.startsWith('<script type="application/json">')
      );
      jsonSource = jsonDescriptor?.loc?.source as string;
      const str = jsonSource.slice(0, jsonSource.indexOf("\n"));
      if (str.includes("type") && str.includes("application/json")) {
        jsonScriptType = JSON_SCRIPT_TYPE.TYPE_JSON;
      } else if (str.includes("name") && str.includes("json")) {
        jsonScriptType = JSON_SCRIPT_TYPE.NAME_JSON;
      }
    } else {
      return jsonMapping;
    }
    if (
      jsonSource.indexOf("\n") !== -1 &&
      jsonSource.lastIndexOf("\n") !== -1
    ) {
      jsonSource = jsonSource.substring(
        jsonSource.indexOf("\n"),
        jsonSource.lastIndexOf("\n")
      );
    }
    // console.log("---> jsonScriptType", jsonScriptType);
    // console.log("---> jsonSource", jsonSource);
    if (jsonScriptType === JSON_SCRIPT_TYPE.TYPE_JSON) {
      // <script type="application/json">
      const jsonUsingComponents = JSON.parse(jsonSource)?.usingComponents;
      if (jsonUsingComponents) {
        for (const [key, val] of Object.entries(jsonUsingComponents)) {
          const { absolutePath = "", relativePath = "" } =
            formatUsingComponentsPath(val as string, uri);
          if (absolutePath || relativePath) {
            jsonMapping.set(key, {
              configPath: val as string,
              absolutePath,
              relativePath,
            });
          }
        }
        // console.log("---> jsonMapping", jsonMapping);
        return jsonMapping;
      }
    } else {
      // TODO <script name="json">
    }
  } catch (err) {
    console.error("---> parseScriptJson error: ", err);
  }
  return jsonMapping;
}

export function formatUsingComponentsPath(
  componentPath: string = "",
  uri: string
): { absolutePath?: string; relativePath?: string } {
  if (!componentPath) return {};
  if (componentPath.indexOf("?") !== -1) {
    componentPath = componentPath.substring(0, componentPath.indexOf("?"));
  }
  if (componentPath.startsWith("./") || componentPath.startsWith("../")) {
    componentPath = path.join(uriToFileName(uri), "..", componentPath);
  } else {
    return { relativePath: componentPath };
  }
  const absolutePath = reolveAbsolutePath(componentPath);
  if (absolutePath) {
    return { absolutePath };
  }
  return { relativePath: componentPath };
}

export function reolveAbsolutePath(componentPath: string): string {
  // 按优先级补充完整路径再尝试访问
  if (componentPath.endsWith(".mpx")) {
    if (fs.existsSync(componentPath)) {
      return componentPath;
    }
  } else {
    if (fs.existsSync(componentPath + ".mpx")) {
      return componentPath + ".mpx";
    } else if (fs.existsSync(componentPath + "/index.mpx")) {
      return componentPath + "/index.mpx";
    }
  }
  return "";
}

export function genTemplate2ScriptMapping(
  templateVariableMapping: TemplateMappingItem | undefined,
  scriptMapping: ScriptMapping | null
): Template2ScriptMapping {
  const mapping = new Map();
  if (!templateVariableMapping || !scriptMapping) {
    return mapping;
  }
  // for (const [mapKey, value] of templateVariableMapping.entries()) {
  //   const { key } = value;
  //   const mappingLoc =
  //     scriptMapping.dataMapping.get(key) ||
  //     scriptMapping.computedMapping.get(key) ||
  //     scriptMapping.methodsMapping.get(key);
  //   if (mappingLoc) {
  //     mapping.set(mapKey, mappingLoc);
  //   }
  // }
  // console.log("---> genTemplate2ScriptMapping: ", mapping);
  return mapping;
}
