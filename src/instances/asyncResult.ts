// src/instances/asyncResult.ts
import { HKT } from "../core/hkt.ts";
import { makeMonad } from "../core/utils.ts";
import { Either, Left, Right } from "../utils/either.ts";

export class AsyncResult<E, A> implements HKT<"AsyncResult", A> {
	readonly _URI!: "AsyncResult";
	readonly _A!: A;

	constructor(public readonly run: () => Promise<Either<E, A>>) {}

	// 修复点1：正确设置错误类型为never
	static of<A>(a: A): AsyncResult<never, A> {
		return new AsyncResult(() => Promise.resolve(new Right(a))) as AsyncResult<
			never,
			A
		>;
	}

	map<B>(f: (a: A) => B): AsyncResult<E, B> {
		return new AsyncResult(() =>
			this.run().then((res) => (res.isRight() ? new Right(f(res.value)) : res))
		);
	}

	// 修复点2：添加显式类型参数
	flatMap<B>(f: (a: A) => AsyncResult<E, B>): AsyncResult<E, B> {
		return new AsyncResult(() =>
			this.run().then((res) => {
				if (res.isRight()) {
					return f(res.value).run();
				}
				return res as Left<E>;
			})
		);
	}
}

// 修复点3：修正Monad实例类型
export const AsyncResultMonad = makeMonad(
	"AsyncResult",
	AsyncResult,
	AsyncResult.of
);
