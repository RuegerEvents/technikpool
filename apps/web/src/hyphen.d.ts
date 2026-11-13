/* eslint-disable @typescript-eslint/no-explicit-any */
// `hyphen` ships no types. Only the German patterns are used, through
// `src/lib/server/hyphenate.ts`.
declare module 'hyphen/de-1996/index.js' {
	const hyphen: {
		hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string;
		[key: string]: any;
	};
	export default hyphen;
}
