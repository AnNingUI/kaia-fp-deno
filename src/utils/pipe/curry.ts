// deno-lint-ignore-file no-explicit-any
export const _ = Symbol("_");

type IsPlaceholder<T> = T extends typeof _ ? true : false;

type DropPlaceholders<
	Args extends any[],
	Provided extends any[]
> = Args extends [infer A, ...infer ARest]
	? Provided extends [infer P, ...infer PRest]
		? IsPlaceholder<P> extends true
			? [A, ...DropPlaceholders<ARest, PRest>]
			: DropPlaceholders<ARest, PRest>
		: Args
	: [];

type CurriedFunction<Args extends any[], R> = <T extends any[]>(
	...args: T
) => DropPlaceholders<Args, T> extends infer RestArgs
	? RestArgs extends any[]
		? RestArgs["length"] extends 0
			? R
			: CurriedFunction<RestArgs, R>
		: never
	: never;

function mergeArgs(prev: any[], next: any[]): any[] {
	const result: any[] = [];
	let i = 0,
		j = 0;

	while (i < prev.length) {
		if (prev[i] === _ && j < next.length) {
			result.push(next[j++]);
		} else {
			result.push(prev[i]);
		}
		i++;
	}
	// Append remaining new args
	while (j < next.length) {
		result.push(next[j++]);
	}

	return result;
}

function countNonPlaceholder(args: any[]): number {
	let count = 0;
	for (let i = 0; i < args.length; i++) {
		if (args[i] !== _) count++;
	}
	return count;
}

export function curry<F extends (...args: any[]) => any>(
	fn: F
): CurriedFunction<Parameters<F>, ReturnType<F>> {
	const arity = fn.length;

	function curried(accum: any[]): any {
		return function (...next: any[]): any {
			const merged = mergeArgs(accum, next);
			const filled = countNonPlaceholder(merged);

			if (filled >= arity) {
				return fn(...merged.slice(0, arity));
			}

			return curried(merged);
		};
	}

	return curried([]);
}
