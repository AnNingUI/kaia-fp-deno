export type Either<L, R> = Left<L> | Right<R>;

export class EitherBase {
	static is(v: any) {
		return v instanceof Left || v instanceof Right;
	}
}

export class Left<L> extends EitherBase {
	readonly _tag = "Left";
	constructor(public readonly value: L) {
		super();
	}

	isLeft(): this is Left<L> {
		return true;
	}

	isRight(): this is Right<never> {
		return false;
	}
}

export class Right<R> extends EitherBase {
	readonly _tag = "Right";
	constructor(public readonly value: R) {
		super();
	}

	public get() {
		return this.value;
	}

	public to<B>(t: (v: R) => B | Promise<B> | void | Promise<void>) {
		return t(this.value);
	}

	isLeft(): this is Left<never> {
		return false;
	}

	isRight(): this is Right<R> {
		return true;
	}
}
