// deno-lint-ignore-file
import { Either, Left, Right } from "../either.ts";
import { is } from "../match/is.ts";

export type Result<T, E> =
	| {
			ok?: null;
			err: E;
			success: false;
	  }
	| {
			ok: T;
			err?: null;
			success: true;
	  };

export type AsyncOrSync<T> = T | Promise<T>;

export interface TryCatchOptions<E, H = E> {
	onError?: (error: any) => H;
	rethrow?: boolean;
}

type TryCatchReturn<T extends any[], R, H> = (
	...args: T
) => R extends Promise<infer U> ? Promise<Result<U, H>> : Result<R, H>;

type WithIsEither<Error, T> = Either<Error, T> & {
	either: typeof is.either<Error, T>;
};
export function tryCatchEither<T>(fn: () => T): WithIsEither<Error, T> {
	try {
		let result = fn();
		let r = new Right(result) as WithIsEither<Error, T>;
		r.either = is.either;
		return r;
	} catch (error) {
		let l = new Left(error as Error) as WithIsEither<Error, T>;
		l.either = is.either;
		return l;
	}
}

export function tryCatch<T extends any[], R, E, H = E>(
	fn: (...args: T) => R, // 直接使用 R 携带完整类型
	options: TryCatchOptions<E, H> = {}
): TryCatchReturn<T, R, H> {
	const handle = (error: any): Result<never, H> => {
		try {
			const handled = options.onError?.(error) ?? (error as H);
			if (options.rethrow)
				throw handled instanceof Error ? handled : new Error(String(handled));
			return { success: false, err: handled };
		} catch (rethrown) {
			if (options.rethrow) throw rethrown;
			return { success: false, err: rethrown as H };
		}
	};

	return ((...args: T) => {
		try {
			const result = fn(...args);

			if (result instanceof Promise) {
				return result.then(
					(value) => ({ success: true, ok: value } as Result<R, H>),
					(error) => handle(error)
				) as Promise<Result<R, H>>;
			}

			return { success: true, ok: result } as Result<R, H>;
		} catch (error) {
			return handle(error) as Result<R, H>;
		}
	}) as TryCatchReturn<T, R, H>; // 添加外层类型断言
}

export const Result = {
	unwrap<T, E>(res: Result<T, E>): T {
		if (res.success) return res.ok;
		throw res.err;
	},

	map<T, E, U>(res: Result<T, E>, fn: (val: T) => U): Result<U, E> {
		return res.success ? { success: true, ok: fn(res.ok) } : res;
	},

	mapError<T, E, F>(res: Result<T, E>, fn: (err: E) => F): Result<T, F> {
		return res.success ? res : { success: false, err: fn(res.err) };
	},

	flatMap<T, E, U>(
		res: Result<T, E>,
		fn: (val: T) => Result<U, E>
	): Result<U, E> {
		return res.success ? fn(res.ok) : res;
	},

	async flatMapAsync<T, E, U>(
		res: Result<T, E> | Promise<Result<T, E>>,
		fn: (val: T) => Promise<Result<U, E>>
	): Promise<Result<U, E>> {
		const resolved = await res;
		return resolved.success ? fn(resolved.ok) : resolved;
	},

	async fromPromise<T, E>(
		p: Promise<T>,
		onError?: (e: any) => E
	): Promise<Result<T, E>> {
		try {
			return { success: true, ok: await p };
		} catch (e) {
			return { success: false, err: onError ? onError(e) : (e as E) };
		}
	},

	async all<T, E>(arr: Promise<Result<T, E>>[]): Promise<Result<T[], E>> {
		const values: T[] = [];
		for (const p of arr) {
			const res = await p;
			if (!res.success) return res;
			values.push(res.ok);
		}
		return { success: true, ok: values };
	},

	async allSettled<T, E>(
		arr: Promise<Result<T, E>>[]
	): Promise<Result<T, E>[]> {
		return Promise.all(arr);
	},

	async any<T, E>(arr: Promise<Result<T, E>>[]): Promise<Result<T, E>> {
		const errors: E[] = [];
		for (const p of arr) {
			const res = await p;
			if (res.success) return res;
			errors.push(res.err);
		}
		return {
			success: false,
			err: errors.length === 1 ? errors[0] : (errors as any),
		};
	},

	combine<R extends Record<string, Result<any, any>>>(
		obj: R
	): Result<
		{ [K in keyof R]: R[K] extends Result<infer T, any> ? T : never },
		R[keyof R] extends Result<any, infer E> ? E : never
	> {
		const out = {} as any;
		for (const key in obj) {
			const res = obj[key];
			if (!res.success) return res;
			out[key] = res.ok;
		}
		return { success: true, ok: out };
	},
};

export function isSuccess<T, E>(
	res: Result<T, E>
): res is { success: true; ok: T } {
	return res.success;
}

export function isFailure<T, E>(
	res: Result<T, E>
): res is { success: false; err: E } {
	return !res.success;
}
