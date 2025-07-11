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

type Length<T extends any[]> = T["length"];

// Promise decode & encode
type PromiseDE<T, U> = T extends Promise<unknown> ? Promise<U> : U;

type CurriedFunction<Args extends any[], R> = <
	OtherReturn = R,
	T extends any[] = Args
>(
	...args: T
) => DropPlaceholders<Args, T> extends infer RestArgs
	? RestArgs extends any[]
		? Length<RestArgs> extends 0
			? R extends OtherReturn
				? R
				: PromiseDE<R, OtherReturn>
			: CurriedFunction<RestArgs, R>
		: never
	: never;

type CurriedVariadic<TArgs extends any[], R> = {
	<_OtherReturn = R, OtherReturn = PromiseDE<R, _OtherReturn>>(
		...args: TArgs
	): CurriedVariadic<TArgs, OtherReturn>;
	exec: () => R;
};

type CurriedWithDefault<Args extends any[], R> = {
	<_OtherReturn = R, OtherReturn = PromiseDE<R, _OtherReturn>>(
		...args: any[]
	): CurriedWithDefault<Args, OtherReturn>;
	exec: () => R;
};

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
	return args.filter((v) => v !== _).length;
}

/**
 * Automatic Curry, but can't handle optional vs. default and remaining parameters
 * @param fn
 * @returns
 */
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

/**
 * Curry for variadic functions (e.g., with optional/rest parameters).
 * New scope per call, requires `.exec()`.
 */
export function curryVariadic<TArgs extends any[], R>(
	fn: (...args: TArgs) => R
): CurriedVariadic<TArgs, R> {
	function build(args: TArgs): CurriedVariadic<TArgs, R> {
		const curried = (...next: TArgs) =>
			build([...args, ...next] as unknown as TArgs);

		const wrapper = curried as CurriedVariadic<TArgs, R>;
		wrapper.exec = () => fn(...args);

		return wrapper;
	}

	return build([] as unknown as TArgs);
}
function mergeArgsWithDefault(
	oldArgs: any[],
	newArgs: any[],
	placeholder = _
): any[] {
	const result = oldArgs.slice();
	let newIndex = 0;

	for (let i = 0; i < result.length && newIndex < newArgs.length; i++) {
		if (result[i] === placeholder) {
			result[i] = newArgs[newIndex++];
		}
	}

	while (newIndex < newArgs.length) {
		result.push(newArgs[newIndex++]);
	}

	return result;
}

function initArgs(length: number, placeholder: any = _): any[] {
	return new Array(length).fill(placeholder);
}

/**
 * Curry with default parameters.
 * Returns new scope each call. Supports placeholder. Requires manual `.exec()`.
 */
export function curryWithDefault<F extends (...args: any[]) => any>(
	fn: F
): CurriedWithDefault<Parameters<F>, ReturnType<F>> {
	const total = fn.length;

	function build(
		args: any[]
	): CurriedWithDefault<Parameters<F>, ReturnType<F>> {
		const curried: any = (...next: any[]) => {
			const merged = mergeArgsWithDefault(args, next);
			return build(merged);
		};

		curried.exec = () => {
			const filled = args.map((a) => (a === _ ? undefined : a));
			return fn(...filled);
		};

		return curried;
	}

	return build(initArgs(total));
}

interface Executable {
	exec: () => any;
}

export function exec<T extends Executable>(obj: T): ReturnType<T["exec"]> {
	return obj.exec();
}
