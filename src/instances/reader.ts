import type { HKT } from "../core/hkt.ts";
import { makeMonad } from "../core/utils.ts";
import type { Monad } from "../index.ts";

export class Reader<R, A> implements HKT<"Reader", A> {
	readonly _URI!: "Reader";
	readonly _A!: A;

	constructor(public readonly run: (env: R) => A) {}

	static of<R, A>(a: A): Reader<R, A> {
		return new Reader(() => a);
	}

	map<B>(f: (a: A) => B): Reader<R, B> {
		return new Reader((r) => f(this.run(r)));
	}

	ap<B>(fab: Reader<R, (a: A) => B>): Reader<R, B> {
		return new Reader((r) => fab.run(r)(this.run(r)));
	}

	flatMap<B>(f: (a: A) => Reader<R, B>): Reader<R, B> {
		return new Reader((r) => f(this.run(r)).run(r));
	}

	local(f: (r: R) => R): Reader<R, A> {
		return new Reader((r) => this.run(f(r)));
	}
}

export const ReaderMonad: Monad<"Reader"> = makeMonad(
	"Reader",
	Reader,
	Reader.of,
	(fab, fa) =>
		// deno-lint-ignore no-explicit-any
		fa.ap(fab as any)
);
