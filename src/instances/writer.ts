// deno-lint-ignore-file
import { HKT } from "../core/hkt.ts";
import { Monad } from "../core/typeClass.ts";
import { makeMonad } from "../core/utils.ts";

type LogNode<W> = {
	log: W;
	next: LogNode<W> | null;
};

export class Writer<W, A> implements HKT<"Writer", A> {
	readonly _URI!: "Writer";
	readonly _A!: A;

	constructor(
		public readonly value: A,
		public readonly log: W, // This remains unchanged (as a string in the case of your example)
		private readonly monoid: { empty: W; concat: (w1: W, w2: W) => W }
	) {}

	static of<W, A>(
		monoid: { empty: W; concat: (w1: W, w2: W) => W },
		a: A
	): Writer<W, A> {
		return new Writer(a, monoid.empty, monoid);
	}

	map<B>(f: (a: A) => B): Writer<W, B> {
		return new Writer(f(this.value), this.log, this.monoid);
	}

	ap<B>(fab: Writer<W, (a: A) => B>): Writer<W, B> {
		return new Writer(
			fab.value(this.value),
			this.monoid.concat(this.log, fab.log), // Direct concatenation
			this.monoid
		);
	}

	flatMap<B>(f: (a: A) => Writer<W, B>): Writer<W, B> {
		const result = f(this.value);
		return new Writer(
			result.value,
			this.monoid.concat(this.log, result.log), // Direct concatenation
			this.monoid
		);
	}

	listen(): Writer<W, [A, W]> {
		return new Writer([this.value, this.getLog()], this.log, this.monoid);
	}

	private getLog(): W {
		// Here we perform the actual log concatenation when it's needed.
		return this.log;
	}
}

export const WriterMonad = <W>(monoid: {
	empty: W;
	concat: (w1: W, w2: W) => W;
}): Monad<"Writer"> => {
	const of = (a: any) => Writer.of(monoid, a);
	return makeMonad("Writer", Writer, of, (fab, fa) => fa.ap(fab as any));
};
