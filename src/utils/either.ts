export type Either<L, R> = Left<L> | Right<R>;

export class EitherBase<L, R> {
	static is(v: unknown): v is Either<unknown, unknown> {
		return v instanceof Left || v instanceof Right;
	}

	isLeft(): this is Left<L> {
		return false;
	}

	isRight(): this is Right<R> {
		return false;
	}

	match<B>({ left, right }: { left: (l: L) => B; right: (r: R) => B }): B {
		if (this.isLeft()) {
			return left?.(this.value);
		} else if (this.isRight()) {
			return right?.(this.value);
		} else {
			return null as B;
		}
	}
}

export class Left<L> extends EitherBase<L, never> {
	readonly _tag = "Left";
	constructor(public readonly value: L) {
		super();
	}

	override isLeft(): this is Left<L> {
		return true;
	}

	override isRight(): this is Right<never> {
		return false;
	}
}

export class Right<R> extends EitherBase<never, R> {
	readonly _tag = "Right";
	constructor(public readonly value: R) {
		super();
	}

	public get(): R {
		return this.value;
	}

	public to<B>(
		t: (v: R) => B | Promise<B> | void | Promise<void>
	): B | Promise<B> | void | Promise<void> {
		return t(this.value);
	}

	override isLeft(): this is Left<never> {
		return false;
	}

	override isRight(): this is Right<R> {
		return true;
	}
}
