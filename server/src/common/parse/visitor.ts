import traverse, { Scope } from "@babel/traverse";
import * as t from "@babel/types";
import { MapLocation } from "../types";

/**
 * 获取函数体内所有顶级 return 语句
 * @param statement
 * @returns
 */
export function findBlockReturnStatement(statement: t.BlockStatement) {
  const result: t.ReturnStatement[] = [];

  traverse(t.program(statement.body), {
    noScope: true,
    ReturnStatement(path) {
      result.push(path.node);
    },
    BlockStatement() {},
    shouldSkip(path) {
      return (
        path.isFunction() ||
        path.isFunctionDeclaration() ||
        path.isFunctionExpression() ||
        path.isArrowFunctionExpression() ||
        path.isClassDeclaration() ||
        path.isClass() ||
        path.isDeclaration()
      );
    },
  });

  return result;
}

function getName(prop: t.ObjectExpression["properties"][number]): string | undefined {
  if (t.isObjectProperty(prop) || t.isStringLiteral(prop)) {
    if (prop.computed) return;

    if (t.isIdentifier(prop.key)) {
      return prop.key.name;
    }

    if (t.isStringLiteral(prop.key)) {
      return prop.key.value;
    }
  }

  return;
}

/**
 * TODO: 收集所有信息，动态分析
 *
 * @param returns
 * @returns
 */
export function collectReturnStatement(returns: t.ReturnStatement[]): Record<string, MapLocation> {
  const result: Record<string, MapLocation> = {};

  for (const ret of returns) {
    if (ret.argument && t.isObjectExpression(ret.argument)) {
      for (const prop of ret.argument.properties) {
        const name = getName(prop);

        if (!name) continue;

        result[name] = {
          start: prop.loc?.start.index || 0,
          end: prop.loc?.end.index || 0,
        };
      }
    }
  }

  return result;
}
