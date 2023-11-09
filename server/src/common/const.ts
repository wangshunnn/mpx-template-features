export const WORD_TYPE = {
	VARIABLE: 'script-variable',
	FUNCTION: 'script-function',
	STYLE: 'style-class',
} as const;


export const COMPLETION_DATA_TYPE = {
	DATA_VARIABLE: 'script-data-variable',
	COMPUTED_VARIABLE: 'script-computed-variable',
	METHOD_FUNCTION: 'script-function',
	STYLE_CLASS: 'style-class',
} as const;