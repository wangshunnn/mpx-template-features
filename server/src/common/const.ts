export const WORD_TYPE = {
  VARIABLE: "script-variable",
  FUNCTION: "script-function",
  STYLE: "style-class",
} as const;

export const COMPLETION_KIND = {
  LEGACY_DATA_VARIABLE: "script-legacy-data-variable",
  LEGACY_COMPUTED_VARIABLE: "script-legacy-computed-variable",
  LEGACY_METHOD_FUNCTION: "script-legacy-function",
  SETUP_DEFINE_PROPS: "script-setup-define-props",
  SETUP_DEFINE_EXPOSE: "script-setup-define-expose",
  STYLE_CLASS: "style-class",
} as const;

export const enum SCRIPT_CREATE_COMPONENT_PROPS {
  DATA = "data",
  COMPUTED = "computed",
  METHODS = "methods",
  SETUP = "setup",
}

export const enum SETUP_GLOBAL_FUNCTION_NAME {
  DEFINE_PROPS = "defineProps",
  DEFINE_EXPOSE = "defineExpose",
}

export const enum JSON_SCRIPT_TYPE {
  NAME_JSON = "name-json",
  TYPE_JSON = "type-json",
}
