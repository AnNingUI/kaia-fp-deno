// deno-lint-ignore-file
import { type Either, Left, Right } from "../either.ts";
import { is } from "./is.ts";
type AsyncOrSync<T> = T | Promise<T>;
type MatchHandler<T, R> = (val: T) => AsyncOrSync<R>;
type Condition<T> = (val: unknown) => val is T;

type Callback<Output> = (value: Output, index: number) => void;

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
	forEach: (
		list: Input[],
		concurrency?: number,
		callback?: Callback<Output>
	) => Promise<Output[]>;
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
	forEach: (
		list: Input[],
		callback?: Callback<Output>
	) => Either<Error, Output[]>;
}

function createMatcherManager<Input, Output>(): MatcherManager<Input, Output> {
	const cases = new Map<Condition<any>, MatchHandler<any, Output>>();
	let fallbackHandler: MatchHandler<Input, Output> | null = null;

	const runner = async (value: Input): Promise<Output> => {
		for (const [check, handler] of cases) {
			if (check(value)) return handler(value);
		}
		if (fallbackHandler) return fallbackHandler(value);
		throw new Error("No match found");
	};

	const forEach = async (
		list: Input[],
		concurrency = navigator?.hardwareConcurrency || 8,
		callback: Callback<Output> = () => {}
	): Promise<Output[]> => {
		const length = list.length;
		const results: Output[] = new Array(length);

		let currentIndex = 0;
		let running = 0;

		return new Promise((resolve, reject) => {
			const next = () => {
				while (running < concurrency && currentIndex < length) {
					const index = currentIndex++;
					const value = list[index];
					running++;

					Promise.resolve(runner(value))
						.then((result) => {
							results[index] = result;
							callback(result, index);
						})
						.catch(reject)
						.finally(() => {
							running--;
							if (currentIndex >= length && running === 0) {
								resolve(results);
							} else {
								queueMicrotask(next); // 更快微任务调度
							}
						});
				}
			};

			next(); // 启动任务
		});
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
		forEach,
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

	const forEach = (
		list: Input[],
		callback: Callback<Output> = () => {}
	): Either<Error, Output[]> => {
		const len = list.length;
		const results = new Array<Output>(len);

		for (let i = 0; i < len; i++) {
			const val = list[i];
			let matched = false;

			for (const [check, handler] of cases) {
				if (check(val)) {
					const result = handler(val);
					results[i] = result as Output;
					callback(result as Output, i);
					matched = true;
					break;
				}
			}

			if (!matched) {
				if (fallbackHandler) {
					const result = fallbackHandler(val);
					results[i] = result as Output;
					callback(result as Output, i);
				} else {
					return new Left(new Error(`No match found at index ${i}`));
				}
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
		forEach,
	};

	return api;
}

export function match<Input, Output>(): MatcherManager<Input, Output> {
	const manager = createMatcherManager<Input, Output>();
	return manager;
}

export function matchSync<Input, Output>(): MatcherManagerSync<Input, Output> {
	const manager = createMatcherManagerSync<Input, Output>();
	return manager;
}

export { createMatcherManager, createMatcherManagerSync };
