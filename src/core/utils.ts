// deno-lint-ignore-file
import type { URItoKind } from "./hkt.ts";
import { Monad } from "./typeClass.ts";

export function makeMonad<F extends keyof URItoKind<any>>(
	_uri: F,
	Class: new (...args: any[]) => URItoKind<any>[F],
	of: (a: any) => URItoKind<any>[F],
	customAp?: (fab: any, fa: any) => any
): Monad<F> {
	const defaultAp = (fab: any, fa: any) => fab.flatMap((f: any) => fa.map(f));
	return {
		of,
		map: (fa, f) => Class.prototype.map.call(fa, f),
		ap: customAp || defaultAp,
		flatMap: (fa, f) => (fa as any).flatMap(f),
	};
}
