import type { HKT } from "../core/hkt.ts";
import { makeMonad } from "../core/utils.ts";
import type { Monad } from "../index.ts";

export class State<S, A> implements HKT<"State", A> {
	readonly _URI!: "State";
	readonly _A!: A;

	constructor(public readonly run: (s: S) => [A, S]) {}

	static of<S, A>(a: A): State<S, A> {
		return new State((s) => [a, s]);
	}

	map<B>(f: (a: A) => B): State<S, B> {
		return new State((s) => {
			const [a, newState] = this.run(s);
			return [f(a), newState];
		});
	}

	flatMap<B>(f: (a: A) => State<S, B>): State<S, B> {
		return new State((s) => {
			const [a, newState] = this.run(s);
			return f(a).run(newState);
		});
	}
}

export const StateMonad: Monad<"State"> = makeMonad("State", State, State.of);
