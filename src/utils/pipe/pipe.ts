// 统一类型声明，增加可读性和可维护性
type MaybePromise<T> = T | Promise<T>;
type PipeFunction<T> = (arg: T) => T;
type PipeAsyncFunction<T> = (arg: T) => MaybePromise<T>;

// 同步版本的 pipe 函数
export function pipe<T>(...funcs: PipeFunction<T>[]): PipeFunction<T> {
	if (funcs.length === 0) {
		return (arg: T) => arg; // 空管道返回原值
	}

	// 使用 reduce 依次执行每个函数
	return (initialValue: T) => funcs.reduce((acc, fn) => fn(acc), initialValue);
}

// 异步版本的 pipe 函数
export function pipeAsync<T>(
	...funcs: PipeAsyncFunction<T>[]
): (arg: T) => Promise<T> {
	return async (initial) => {
		let value = initial;
		for (const fn of funcs) {
			value = await fn(value);
		}
		return value;
	};
}
