// deno-lint-ignore-file
import { Either, Left, Right } from "../either.ts";
import { is } from "./is.ts";
type AsyncOrSync<T> = T | Promise<T>;
type MatchHandler<T, R> = (val: T) => AsyncOrSync<R>;
type Condition<T> = (val: unknown) => val is T;

interface MatcherManager<Input, Output> {
	cases: Map<Condition<any>, MatchHandler<any, Output>>;
	fallbackHandler: MatchHandler<Input, Output> | null;
	with<T = Input>(
		cond: Condition<T>,
		handler: MatchHandler<T, Output>
	): MatcherManager<Input, Output>;
	with2(
		to: (v: Input) => boolean,
		handler: MatchHandler<Input, Output>
	): MatcherManager<Input, Output>;
	otherwise(
		handler: MatchHandler<Input, Output>
	): MatcherManager<Input, Output>;
	run: (value: Input) => Promise<Output>;
	matchForEach: (list: Input[]) => AsyncOrSync<Output[]>; // Added method for processing list
}

interface MatcherManagerSync<Input, Output> {
	cases: Map<Condition<any>, MatchHandler<any, Output>>;
	fallbackHandler: MatchHandler<Input, Output> | null;
	with<T = Input>(
		cond: Condition<T>,
		handler: MatchHandler<T, Output>
	): MatcherManagerSync<Input, Output>;
	with2(
		to: (v: Input) => boolean,
		handler: MatchHandler<Input, Output>
	): MatcherManagerSync<Input, Output>;
	otherwise(
		handler: MatchHandler<Input, Output>
	): MatcherManagerSync<Input, Output>;
	unwrap: (value: Input) => Either<null, Right<Output> | Right<undefined>>;
	run: (value: Input) => Either<Error, Output>;
	matchForEach: (list: Input[]) => Either<Error, Output[]>; // Added method for processing list
}

function createMatcherManager<Input, Output>(): MatcherManager<Input, Output> {
	const cases = new Map<Condition<any>, MatchHandler<any, Output>>();
	let fallbackHandler: MatchHandler<Input, Output> | null = null;

	const runner = async (value: Input): Promise<Output> => {
		for (const [check, handler] of cases) {
			if (check(value)) return handler(value);
		}
		if (fallbackHandler && typeof fallbackHandler === "function") {
			return fallbackHandler(value);
		}
		throw new Error("No match found");
	};

	const matchForEach = async function* (list: Input[]): AsyncGenerator<Output> {
		for (const value of list) {
			yield await runner(value);
		}
	};

	const api: MatcherManager<Input, Output> = {
		cases,
		fallbackHandler,
		with<T>(cond: Condition<T>, handler: MatchHandler<T, Output>) {
			cases.set(cond, handler);
			return api;
		},
		with2(to: (v: Input) => boolean, handler: MatchHandler<Input, Output>) {
			const is2 = is.to(to);
			cases.set(is2, handler);
			return api;
		},
		otherwise(handler: MatchHandler<Input, Output>) {
			fallbackHandler = handler;
			return api;
		},
		run: runner,
		matchForEach(list: Input[]) {
			const generator = matchForEach(list);
			const results: Output[] = [];
			(async () => {
				for await (const result of generator) {
					results.push(result);
				}
			})();
			return results;
		},
	};

	return api;
}

function createMatcherManagerSync<Input, Output>(): MatcherManagerSync<
	Input,
	Output
> {
	const cases = new Map<Condition<any>, MatchHandler<any, Output>>();
	let fallbackHandler: MatchHandler<Input, Output> | null = null;

	const runner = (value: Input): Either<Error, Output> => {
		for (const [check, handler] of cases) {
			if (check(value)) return new Right(handler(value)) as Right<Output>;
		}
		if (fallbackHandler) {
			return new Right(fallbackHandler(value)) as Right<Output>;
		}
		return new Left(new Error("No match found"));
	};

	const matchForEach = (list: Input[]): Either<Error, Output[]> => {
		const results: Output[] = [];
		for (const value of list) {
			const result = runner(value);
			if (result instanceof Right) {
				results.push(result.value);
			} else {
				return new Left(result.value);
			}
		}
		return new Right(results);
	};

	const api: MatcherManagerSync<Input, Output> = {
		cases,
		fallbackHandler,
		with<T>(cond: Condition<T>, handler: MatchHandler<T, Output>) {
			cases.set(cond, handler);
			return api;
		},
		with2(to: (v: Input) => boolean, handler: MatchHandler<Input, Output>) {
			const is2 = is.to(to);
			cases.set(is2, handler);
			return api;
		},
		otherwise(handler: MatchHandler<Input, Output>) {
			fallbackHandler = handler;
			return api;
		},
		unwrap: (value: Input): Either<null, Right<Output> | Right<undefined>> => {
			for (const [check, handler] of cases) {
				if (check(value))
					return new Right(handler(value) as Output) as Either<
						null,
						Right<Output>
					>;
			}
			if (fallbackHandler)
				return new Right(fallbackHandler(value) as Output) as Either<
					null,
					Right<Output>
				>;
			return new Right(undefined) as unknown as Either<null, Right<undefined>>;
		},
		run: runner,
		matchForEach(list: Input[]) {
			return matchForEach(list);
		},
	};

	return api;
}

export function match<Input, Output>() {
	const manager = createMatcherManager<Input, Output>();
	return manager;
}

export function matchSync<Input, Output>(): MatcherManagerSync<Input, Output> {
	const manager = createMatcherManagerSync<Input, Output>();
	return manager;
}

export { createMatcherManager, createMatcherManagerSync };
