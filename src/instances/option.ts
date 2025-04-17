import type { HKT } from "../core/hkt.ts";
import type { Monad } from "../core/typeClass.ts";

export class Options<A> implements HKT<"Options", A> {
	readonly _URI!: "Options";
	readonly _A!: A;
	readonly _tag?: "Some" | "None";

	constructor(public readonly value: A | null) {}

	public isNone(): this is None {
		return this.value === null && this instanceof None && this._tag === "None";
	}

	public isSome(): this is Some<A> {
		return this.value !== null && this instanceof Some && this._tag === "Some";
	}

	public orElse<B>(value: B): Options<A | B> {
		return this.isNone() ? new Some(value) : this;
	}

	public get(): A | never {
		if (this.value === null) {
			throw new Error("Option.get called on None");
		}
		return this.value;
	}

	public getOrElse<B>(defaultValue: B): A | B {
		return this.isSome() ? (this.value as A) : defaultValue;
	}
}

export class Some<A> extends Options<A> implements HKT<"Options", A> {
	declare readonly _URI: "Options";
	declare readonly _A: A;
	override readonly _tag: "Some" = "Some";

	constructor(public override readonly value: A) {
		super(value);
	}
}

export class None extends Options<never> implements HKT<"Options", never> {
	declare readonly _URI: "Options";
	declare readonly _A: never;
	override readonly _tag: "None" = "None";
	override readonly value = null;

	private static INSTANCE: None;

	private constructor() {
		super(null);
	}

	public static of(): None {
		if (!this.INSTANCE) {
			this.INSTANCE = new None();
			return this.INSTANCE;
		} else {
			return this.INSTANCE as None;
		}
	}
}

export const OptionMonad: {
	none: () => None;
} & Monad<"Options"> = {
	none: () => None.of(),
	of: <A>(a: A): Options<A> => new Some(a),
	map: (fa, f) => (fa instanceof Some ? new Some(f(fa.value)) : None.of()),
	ap: (fab, fa) =>
		fab instanceof Some && fa instanceof Some
			? new Some(fab.value(fa.value))
			: None.of(),
	flatMap: (fa, f) => (fa instanceof Some ? f(fa.value) : None.of()),
};
