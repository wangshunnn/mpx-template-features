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
import * as stylus from "stylus";
import { URI } from "vscode-uri";
import { TextDocument } from "vscode-languageserver-textdocument";
// import traverse from '@babel/traverse';

export type MapLocation = { start: number; end: number };
export type MatrixLocation = { line: number; column: number };
export type MappingValue = { key: string; loc: MapLocation };
export type TemplateMappingItem = Map<string, MappingValue>;
export type ScriptMappingItem = Map<string, MapLocation>;
export type TemplateMapping = {
  classMapping: TemplateMappingItem;
  variableMapping: TemplateMappingItem;
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
export type ScriptJsonMapping = Map<string, MapLocation>;
export type Template2ScriptMapping = Map<string, MapLocation>;
export type SFCMapping = {
  templateMapping: TemplateMapping | null;
  scriptMapping: ScriptMapping | null;
  stylusMapping: StylusMapping | null;
  scriptJsonMapping: ScriptJsonMapping | null;
  template2ScriptMapping: Template2ScriptMapping | null;
};

// eg: file:///Users/didi/mycode/test/hello.mpx -> /Users/didi/mycode/test/hello.mpx
export const uriToFileName = (uri: string) =>
  URI.parse(uri).fsPath.replace(/\\/g, "/");

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
    };
  }
}

export const ignorePropList = ["wx:key", "wx:ref"];

export function parseTemplate(descriptor: SFCDescriptor, uri: string) {
  if (!descriptor.template?.content) return null;
  const compileTemplateResult = compileTemplate({
    source: descriptor.template?.ast?.loc?.source,
    filename: uri,
    id: uri + "_mpx_template_",
  });
  const classMapping = new Map<string, MappingValue>();
  const variableMapping = new Map<string, MappingValue>();
  const templateLoc = {
    start: descriptor.template.ast.loc?.start?.offset + 1,
    end: descriptor.template.ast.loc?.end?.offset + 1,
  };

  function traverseTemplate(ast: RootNode) {
    if (!ast || !ast.children) return null;
    // dfs 深度优先好处可以保证位置顺序递增
    function dfsTraverseChildren(children: TemplateChildNode[]) {
      for (const child of children) {
        if (child.type === 1) {
          if (child.props?.length > 0) {
            for (const prop of child.props) {
              if (!("value" in prop)) {
                continue;
              }
              if (prop.name === "class") {
                const content = prop.value?.content;
                const _loc = prop.value?.loc;
                const [key = "", offset = 0] = formatCotent(content);
                const locStart =
                  _loc!.start.offset + offset + templateLoc.start;
                key &&
                  classMapping.set(key + "-" + locStart, {
                    key,
                    loc: {
                      start: locStart,
                      end: locStart + key.length,
                    },
                  });
              } else if (
                prop.name.startsWith("bind") ||
                prop.name.startsWith("catch") ||
                prop.value?.content.includes("{{")
              ) {
                const content = prop.value?.content;
                const _loc = prop.value?.loc;
                const [key = "", offset = 0] = formatCotent(content);
                const locStart =
                  _loc!.start.offset + offset + templateLoc.start;
                key &&
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

  // console.log(
  //   "---> parseTemplate: ",
  //   classMapping.keys(),
  //   variableMapping.keys()
  // );
  const classLocationSort = [...classMapping.entries()].map(([, v]) => v);
  const variableLocationSort = [...variableMapping.entries()].map(([, v]) => v);
  return {
    classMapping,
    variableMapping,
    classLocationSort,
    variableLocationSort,
    loc: templateLoc,
  };
}

export function formatCotent(content = ""): [string, number] | [] {
  if (!content) return [];
  let key = content.trim();
  if (key.startsWith("{{") && key.endsWith("}}")) {
    key = key.slice(2, -2).trim();
  }
  if (
    key.includes(" ") ||
    key.includes("'") ||
    key.includes('"') ||
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
  return (
    descriptor.scriptSetup ||
    !(descriptor.script?.attrs?.name + "").toLowerCase().includes("json")
  );
}

export function parseScriptlang(descriptor: SFCDescriptor, uri: string) {
  if (!hasScriptLang) return null;

  // if (descriptor.scriptSetup) {
  // 	return parseScriptSetup(descriptor, uri);
  // }
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
  if (descriptor.styles[0]?.lang !== "stylus") {
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
  uri?: string
) {
  const jsonMapping = new Map<string, MapLocation>();
  return jsonMapping;
}

export function genTemplate2ScriptMapping(
  templateVariableMapping: TemplateMappingItem | undefined,
  scriptMapping: ScriptMapping | null
): Template2ScriptMapping {
  const mapping = new Map();
  if (!templateVariableMapping || !scriptMapping) {
    return mapping;
  }
  for (const [mapKey, value] of templateVariableMapping.entries()) {
    const { key } = value;
    const mappingLoc =
      scriptMapping.dataMapping.get(key) ||
      scriptMapping.computedMapping.get(key) ||
      scriptMapping.methodsMapping.get(key);
    if (mappingLoc) {
      mapping.set(mapKey, mappingLoc);
    }
  }
  // console.log("---> genTemplate2ScriptMapping: ", mapping);
  return mapping;
}
