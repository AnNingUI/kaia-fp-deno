// deno-lint-ignore-file
import { HKT } from "../core/hkt.ts";
import { Monad } from "../core/typeClass.ts";

export class IO<A> implements HKT<"IO", A> {
	readonly _URI!: "IO";
	readonly _A!: A;

	constructor(public readonly run: () => A) {}

	static of<A>(a: A): IO<A> {
		return new IO(() => a);
	}

	map<B>(f: (a: A) => B): IO<B> {
		return new IO(() => f(this.run()));
	}

	flatMap<B>(f: (a: A) => IO<B>): IO<B> {
		return new IO(() => f(this.run()).run());
	}
}

export const IOMonad: Monad<"IO"> = {
	map: (fa, f) => fa.map(f),
	of: IO.of,
	ap: (fab, fa) => fab.flatMap((f: any) => fa.map(f)),
	flatMap: (fa, f) => fa.flatMap(f),
};
