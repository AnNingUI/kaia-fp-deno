// deno-lint-ignore-file
import { MiniLRUCache } from "../cache/miniLRUCache.ts";
import { type Either, Left, Right } from "../either.ts";
import { is } from "./is.ts";
type AsyncOrSync<T> = T | Promise<T>;
type MatchHandler<T, R> = (val: T) => AsyncOrSync<R>;
type MatchHandOrValue<T, R> = MatchHandler<T, R> | R;
type Condition<T> = (val: unknown) => val is T;

type Callback<Output> = (value: Output, index: number) => void;

const valueToFunc = <R, T>(v: MatchHandOrValue<R, T>): MatchHandler<R, T> => {
	return (typeof v === "function" ? v : () => v) as MatchHandler<R, T>;
};

interface MatcherManager<Input, Output> {
	cases: Map<Condition<any>, MatchHandler<any, Output>>;
	fallbackHandler: MatchHandler<Input, Output> | null;
	with<T = Input>(
		cond: Condition<T>,
		handler: MatchHandOrValue<T, Output>
	): MatcherManager<Input, Output>;
	with2(
		to: ((v: Input) => boolean) | Input,
		handler: MatchHandOrValue<Input, Output>
	): MatcherManager<Input, Output>;
	otherwise(
		handler: MatchHandOrValue<Input, Output>
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
		handler: MatchHandOrValue<T, Output>
	): MatcherManagerSync<Input, Output>;
	with2(
		to: ((v: Input) => boolean) | Input,
		handler: MatchHandOrValue<Input, Output>
	): MatcherManagerSync<Input, Output>;
	otherwise(
		handler: MatchHandOrValue<Input, Output>
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
		with<T>(cond: Condition<T>, handler: MatchHandOrValue<T, Output>) {
			cases.set(cond, valueToFunc(handler));
			return api;
		},
		with2(
			to: ((v: Input) => boolean) | Input,
			handler: MatchHandOrValue<Input, Output>
		) {
			const t =
				typeof to === "function"
					? (to as (v: Input) => boolean)
					: (v: Input) => v === to;
			const is2 = is.to(t);
			cases.set(is2, valueToFunc(handler));
			return api;
		},
		otherwise(handler: MatchHandOrValue<Input, Output>) {
			fallbackHandler = valueToFunc(handler);
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
		with<T>(cond: Condition<T>, handler: MatchHandOrValue<T, Output>) {
			cases.set(cond, valueToFunc(handler));
			return api;
		},
		with2(
			to: ((v: Input) => boolean) | Input,
			handler: MatchHandOrValue<Input, Output>
		) {
			const t =
				typeof to === "function"
					? (to as (v: Input) => boolean)
					: (v: Input) => v === to;
			const is2 = is.to(t);
			cases.set(is2, valueToFunc<Input, Output>(handler));
			return api;
		},
		otherwise(handler: MatchHandOrValue<Input, Output>) {
			fallbackHandler = valueToFunc(handler);
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

type LRUOptions =
	| {
			useLRU: true;
			maxSize: number;
			maxAge: number;
			autoSweep?: boolean;
			sweepInterval?: number;
	  }
	| {
			useLRU: false;
			maxSize?: number;
			maxAge?: number;
	  };

type MatcherSyncBuilder<A, B> = (
	self: (value: A) => B,
	matcher: MatcherManagerSync<A, B>
) => MatcherManagerSync<A, B>;
export type MatcherBuilder<A, B> = (
	self: (value: A) => Promise<B>,
	matcher: MatcherManager<A, B>
) => MatcherManager<A, B>;
/**
 * This function is suitable for the fib function will be similar to the iterative evaluation of the value of the scenario,
 * the use of caching can be avoided to repeat the calculation.
 * @template Input , Output
 * @param builder
 * @param options
 * @returns
 * @example
 * //
 * // Of course, we recommend other algorithms,
 * // such as the Matrix Fast Power Algorithm,
 * // for purely tangent-linear computations.
 * //
 * const fibSyncMemo = matchSyncMemo<bigint, bigint>(
 *		(self, m) =>
 *			m
 *				.with2((n) => n <= 1n || n === 2n, 1n)
 *				.otherwise((n) => self(n - 1n) + self(n - 2n)),
 *		{
 *			useLRU: true,
 *			maxSize: 50,
 *			maxAge: 3000,
 *		}
 *	);
 */
export function matchSyncMemo<Input, Output>(
	builder: MatcherSyncBuilder<Input, Output>,
	options: LRUOptions = { useLRU: false, maxSize: 1000, maxAge: 1000 * 60 * 5 }
): (value: Input) => Output {
	let fn!: (value: Input) => Output;

	// Pre-construct matcher to avoid rebuilding on each call
	const matcher = builder((v: Input) => fn(v), matchSync<Input, Output>());

	const cache = options.useLRU
		? new Map<Input, Output>()
		: new MiniLRUCache<Input, Output>(options.maxSize!, {
				ttl: options.maxAge ?? 0,
		  });
	const weakCache = new WeakMap<object, Output>();

	fn = (value: Input): Output => {
		const isObject = typeof value === "object" && value !== null;

		// 1) Check cache
		if (isObject) {
			const cached = weakCache.get(value as object);
			if (cached !== undefined) return cached;
		} else {
			const cached = cache.get(value);
			if (cached !== undefined) return cached;
		}

		// 2) Run matcher only once
		const result = matcher.run(value);

		// 3) Handle error or extract result
		if (result.isLeft()) throw result.value;
		const output = (result as Right<Output>).value;

		// 4) Cache result
		if (isObject) {
			weakCache.set(value as object, output);
		} else {
			cache.set(value, output);
		}

		return output;
	};

	return fn;
}

/**
 * Add memoization to async match (concurrency-friendly version)
 * @template Input, Output
 * @param builder A constructor function that takes (self, matcher) => matcher, where self is used for recursive calls
 * @param options Caching strategy. When useLRU is true, uses Map; otherwise uses MiniLRUCache
 * @returns A function of type (value: Input) => Promise<Output> with built-in concurrent deduplication and caching
 */
export function matchAsyncMemo<Input, Output>(
	builder: MatcherBuilder<Input, Output>,
	options: LRUOptions = { useLRU: false, maxSize: 1000, maxAge: 1000 * 60 * 5 }
): (value: Input) => Promise<Output> {
	// 先声明 fn，让 builder 能够在内部递归调用
	let fn!: (value: Input) => Promise<Output>;

	// 构造一个异步 matcher（基于 match()）
	const matcher = builder((v: Input) => fn(v), match<Input, Output>());

	// 根据选项来决定缓存容器
	// 如果 useLRU = true，则直接用 Map<Input, Promise<Output>>
	// 否则用 MiniLRUCache<Input, Promise<Output>>，并指定 ttl 为 maxAge
	const cache = options.useLRU
		? new Map<Input, Promise<Output>>()
		: new MiniLRUCache<Input, Promise<Output>>(options.maxSize!, {
				ttl: options.maxAge ?? 0,
		  });

	// 对象类型单独缓存到弱引用中，自动在对象不可达时被回收
	const weakCache = new WeakMap<object, Promise<Output>>();

	fn = async (value: Input): Promise<Output> => {
		const isObject = typeof value === "object" && value !== null;
		// 先看缓存里有没有“正在进行”或已经完成的 Promise
		if (isObject) {
			const existing = weakCache.get(value as object);
			if (existing) {
				return existing;
			}
		} else {
			const existing = options.useLRU
				? (cache as Map<Input, Promise<Output>>).get(value)
				: (cache as MiniLRUCache<Input, Promise<Output>>).get(value);
			if (existing) {
				return existing;
			}
		}

		// 如果没有，就新建一个 Promise，放入缓存，然后执行 matcher.run
		const rawPromise = (async () => {
			// 如果 matcher.run 抛错，则会走到 catch；注意不要漏掉上层的 reject
			const result = await matcher.run(value);
			return result;
		})();

		// 为了并发安全：包一层 catch，出错时把缓存清理掉
		const wrappedPromise = rawPromise.catch((err) => {
			// 清理对应的缓存项
			if (isObject) {
				weakCache.delete(value as object);
			} else {
				options.useLRU
					? (cache as Map<Input, Promise<Output>>).delete(value)
					: (cache as MiniLRUCache<Input, Promise<Output>>).remove(value);
			}
			// 然后把错误继续往外抛
			return Promise.reject(err);
		});

		// 放入缓存
		if (isObject) {
			weakCache.set(value as object, wrappedPromise);
		} else {
			if (options.useLRU) {
				(cache as Map<Input, Promise<Output>>).set(value, wrappedPromise);
			} else {
				(cache as MiniLRUCache<Input, Promise<Output>>).set(
					value,
					wrappedPromise
				);
			}
		}

		// 最终返回这个 Promise
		return wrappedPromise;
	};

	return fn;
}

export { createMatcherManager, createMatcherManagerSync };
