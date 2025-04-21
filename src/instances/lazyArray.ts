// deno-lint-ignore-file
import type { HKT } from "../core/hkt.ts";
import type { Monad } from "../core/typeClass.ts";

export class LazyArray<A> implements HKT<"LazyArray", A> {
	readonly _URI!: "LazyArray";
	readonly _A!: A;
	private generator: Generator<A, void, unknown>;

	constructor(gen: () => Generator<A, void, unknown>) {
		this.generator = gen();
	}

	static of<A>(value: A): LazyArray<A> {
		return new LazyArray(function* () {
			yield value;
		});
	}

	static fromArray<A>(arr: A[]): LazyArray<A> {
		return new LazyArray(function* () {
			for (const item of arr) yield item;
		});
	}

	run(): IteratorResult<A> {
		return this.generator.next();
	}

	goto<O>(to: (c: A) => O) {
		let next;
		while (!(next = this.generator.next()).done) {
			to(next.value);
		}
		this.generator.return();
	}

	toArray(): A[] {
		const arr: A[] = [];
		let next;
		while (!(next = this.generator.next()).done) {
			arr.push(next.value);
		}
		return arr;
	}

	map<B>(f: (a: A) => B): LazyArray<B> {
		const self = this;
		return new LazyArray(function* () {
			let result: IteratorResult<A>;
			while (!(result = self.generator.next()).done) {
				yield f(result.value);
			}
		});
	}

	flatMap<B>(f: (a: A) => LazyArray<B>): LazyArray<B> {
		const self = this;
		return new LazyArray(function* () {
			let result: IteratorResult<A>;
			while (!(result = self.generator.next()).done) {
				const inner = f(result.value);
				let innerResult: IteratorResult<B>;
				while (!(innerResult = inner.run()).done) {
					yield innerResult.value;
				}
			}
		});
	}
}

export const LazyArrayMonad: Monad<"LazyArray"> = {
	of: LazyArray.of,
	map: (fa, f) => (fa as LazyArray<any>).map(f),
	ap: (fab, fa) =>
		(fab as LazyArray<any>).flatMap((f: any) => (fa as LazyArray<any>).map(f)),
	flatMap: (fa, f) => (fa as LazyArray<any>).flatMap(f),
};
