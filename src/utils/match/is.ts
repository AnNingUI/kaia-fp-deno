// deno-lint-ignore-file
import { Either, Left, Right } from "../either.ts";

export type Predicate<T> = (val: any) => val is T;

function not<T>(pred: Predicate<T>): Predicate<unknown> {
	return (val): val is unknown => !pred(val);
}

interface Wrap<T> {
	match: Predicate<T>;
	or<U>(alt: Predicate<U>): Wrap<T | U>;
}

function wrap<T>(predicate: Predicate<T>): Wrap<T> {
	return {
		match: predicate,
		or: <U>(alt: Predicate<U>) =>
			wrap<T | U>((val): val is T | U => predicate(val) || alt(val)),
	};
}

export type WithInfer<T> = Predicate<T> & {
	/**
	 * ⚠️ Auxiliary field for type extraction, not available at runtime
	 */
	readonly inter: T;
};

export type TupleType<T extends Predicate<any>[]> = {
	[K in keyof T]: T[K] extends Predicate<infer U> ? U : never;
};

function optional<T>(pred: Predicate<T>): Predicate<T | undefined> {
	return (val): val is T | undefined => val === undefined || pred(val);
}

function compose<T>(preds: ((val: any) => boolean)[]): Predicate<T> {
	return (val): val is T => preds.every((p) => p(val));
}

type IsNumberNoMatch = Omit<IsNumberSelf, "match">;
type IsNumberNoNaN = Omit<IsNumberSelf, "nan">;
type IsNumberSelf = {
	toBool(to: (n: number) => boolean): IsNumberNoNaN;
	// >
	gt(n: number): IsNumberNoNaN;
	// >=
	gte(n: number): IsNumberNoNaN;
	// s <= n <= e
	inRange(s: number, e: number): IsNumberNoNaN;
	// <
	lt(n: number): IsNumberNoNaN;
	// <=
	lte(n: number): IsNumberNoNaN;
	// ===
	eq(n: number): IsNumberNoNaN & {
		or(n: number): IsNumberNoNaN;
	};
	even(): Omit<IsNumberNoNaN, "odd" | "even">;
	odd(): Omit<IsNumberNoNaN, "even" | "odd">;
	positive(): Omit<IsNumberNoNaN, "negative" | "positive">;
	negative(): Omit<IsNumberNoNaN, "positive" | "negative">;
	nan(): Omit<IsNumberSelf, keyof IsNumberNoMatch>;
	match: Predicate<number>;
};
const isNumber = (): IsNumberSelf => {
	const preds: ((v: any) => boolean)[] = [(v) => typeof v === "number"];

	const self = {
		toBool(to: (n: number) => boolean) {
			preds.push((v) => to(v));
			return self;
		},
		gt(n: number) {
			preds.push((v) => v > n);
			return self;
		},
		gte(n: number) {
			preds.push((v) => v >= n);
			return self;
		},
		inRange(s: number, e: number) {
			preds.push((v) => v >= s && v <= e);
			return self;
		},
		lt(n: number) {
			preds.push((v) => v < n);
			return self;
		},
		lte(n: number) {
			preds.push((v) => v <= n);
			return self;
		},
		eq(n: number) {
			const i = (v: number) => v === n;
			const len = preds.push(i);
			return {
				...self,
				or: (n: number) => {
					preds[len - 1] = (v) => v === n || i(v);
					return self;
				},
			};
		},
		even() {
			preds.push((v) => v % 2 === 0);
			return self;
		},
		odd() {
			preds.push((v) => v % 2 !== 0);
			return self;
		},
		positive() {
			preds.push((v) => v > 0);
			return self;
		},
		negative() {
			preds.push((v) => v < 0);
			return self;
		},
		nan() {
			preds.push((v) => Number.isNaN(v));
			return {
				match: self.match,
			};
		},
		match: compose<number>(preds),
	};
	return self;
};

type IsStringSelf = {
	toBool(
		to:
			| ((n: string) => boolean)
			| {
					turer: string[];
					falser: string[];
			  }
	): IsStringSelf;
	test(r: RegExp): IsStringSelf;
	includes(substr: string): IsStringSelf;
	startsWith(startStr: string, position?: number): IsStringSelf;
	endsWith(endStr: string, position?: number): IsStringSelf;
	length(n: number): IsStringSelf;
	empty(): IsStringSelf;
	match: Predicate<string>;
};

const isString = (): IsStringSelf => {
	const preds: ((v: any) => boolean)[] = [(v) => typeof v === "string"];
	const self = {
		toBool(
			to:
				| ((n: string) => boolean)
				| {
						turer: string[];
						falser: string[];
				  }
		) {
			preds.push((v: string) => {
				if (typeof to === "function") {
					return to(v);
				} else {
					const turer = to.turer;
					const falser = to.falser;
					return turer.includes(v) && !falser.includes(v);
				}
			});
			return self;
		},
		test(r: RegExp) {
			preds.push((v) => r.test(v));
			return self;
		},
		includes(substr: string) {
			preds.push((v) => v.includes(substr));
			return self;
		},
		startsWith(startStr: string, position?: number) {
			preds.push((v: string) => v.startsWith(startStr, position));
			return self;
		},
		endsWith(endStr: string, position?: number) {
			preds.push((v: string) => v.endsWith(endStr, position));
			return self;
		},
		length(n: number) {
			preds.push((v) => v.length === n);
			return self;
		},
		empty() {
			preds.push((v) => v.length === 0);
			return self;
		},
		match: compose<string>(preds),
	};
	return self;
};

const isBoolean = (): { match: Predicate<boolean> } => ({
	match: (v): v is boolean => typeof v === "boolean",
});

const isArray = <T>(element: Predicate<T>) => ({
	every: (v: unknown): v is T[] => Array.isArray(v) && v.every(element),
	some: (v: unknown): v is T[] => Array.isArray(v) && v.some(element),
});

const isDate =
	(): Predicate<Date> =>
	(val): val is Date =>
		val instanceof Date;

const isBigint =
	(): Predicate<bigint> =>
	(val): val is bigint =>
		typeof val === "bigint";

interface IsShape<T> extends WithInfer<T> {
	extends<S>(other: WithInfer<S>): IsShape<T & S>;
}
function mergeShapes<
	T extends Record<string, Predicate<any>>,
	S extends Record<string, Predicate<any>>
>(a: T, b: S): Record<string, Predicate<any>> {
	return { ...a, ...b };
}
const isShape = <T extends Record<string, Predicate<any>>>(
	shape: T
): IsShape<{
	[K in keyof T]: T[K] extends Predicate<infer U> ? U : never;
}> => {
	type Inferred = {
		[K in keyof T]: T[K] extends Predicate<infer U> ? U : never;
	};

	const fn = ((val: any): val is Inferred => {
		if (typeof val !== "object" || val === null) return false;
		for (const key in shape) {
			if (!shape[key]((val as any)[key])) return false;
		}
		return true;
	}) as IsShape<Inferred>;

	// @ts-expect-error only for static type extraction
	fn.inter = undefined;

	fn.extends = <S>(other: WithInfer<S>) => {
		const otherShape = (other as any)._shape || {};
		const mergedShape = mergeShapes(otherShape, shape);
		return isShape(mergedShape) as IsShape<Inferred & S>;
	};

	// 添加 _shape 属性用于运行时提取原始 shape（可选）
	(fn as any)._shape = shape;

	return fn;
};
const isTuple = <T extends Predicate<any>[]>(
	elements: [...T]
): ((val: any) => val is TupleType<T>) => {
	return (val: any): val is TupleType<T> =>
		Array.isArray(val) &&
		val.length === elements.length &&
		elements.every((p, i) => p(val[i]));
};
const isUnion = <U extends Predicate<any>[]>(
	...variants: [...U]
): ((val: any) => val is U[number] extends Predicate<infer T> ? T : never) => {
	return (val: any): val is U[number] extends Predicate<infer T> ? T : never =>
		variants.some((fn) => fn(val));
};

type IsLiteralSelf<T extends string | number | boolean | null | undefined> = {
	match: Predicate<T>;
};

const isLiteral = <T extends string | number | boolean | null | undefined>(
	expected: T
): IsLiteralSelf<T> => {
	const predicate = (val: any): val is T => val === expected;

	// 直接暴露 predicate 和 match 两种形式
	predicate.match = predicate;

	return predicate;
};

type IsEither<L, R> = {
	shape: (
		leftPred: ReturnType<typeof wrap<L>>,
		rightPred: ReturnType<typeof wrap<R>>
	) => ReturnType<typeof wrap<Either<L, R>>>;

	left: (pred: ReturnType<typeof wrap<L>>) => ReturnType<typeof wrap<Left<L>>>;

	right: (
		pred: ReturnType<typeof wrap<R>>
	) => ReturnType<typeof wrap<Right<R>>>;
};

const isEither = <L, R>(): IsEither<L, R> => {
	return {
		shape: (
			leftPred: ReturnType<typeof wrap<L>>,
			rightPred: ReturnType<typeof wrap<R>>
		) =>
			wrap<Either<L, R>>((val): val is Either<L, R> =>
				val instanceof Left
					? leftPred.match(val.value)
					: val instanceof Right
					? rightPred.match(val.value)
					: false
			),

		left: Object.assign(
			(pred: ReturnType<typeof wrap<L>>) =>
				wrap<Left<L>>(
					(val): val is Left<L> => val instanceof Left && pred.match(val.value)
				),
			// 修改这里：将 Left<unknown> 改为 Left<any>
			wrap((val: unknown): val is Left<L> => val instanceof Left)
		),

		right: Object.assign(
			(pred: ReturnType<typeof wrap<R>>) =>
				wrap<Right<R>>(
					(val): val is Right<R> =>
						val instanceof Right && pred.match(val.value)
				),
			// 修改这里：将 Right<unknown> 改为 Right<any>
			wrap((val: unknown): val is Right<R> => val instanceof Right)
		),
	};
};

type IsClazz<T> = {
	match: Predicate<T>;
	(val: unknown): val is T;
};

const isClazz = <T>(ctor: { new (...args: any[]): T }): IsClazz<T> => {
	const u = (val: unknown): val is T => val instanceof ctor;
	u.match = u;
	return u;
};

// boolean 布尔匹配 转 is
const isTo = <T>(to: (v: T) => boolean): ((val: unknown) => val is T) => {
	const u = (val: unknown): val is T => to(val as T);
	return u;
};

export interface IsTypes {
	number: typeof isNumber;
	string: typeof isString;
	boolean: typeof isBoolean;
	array: typeof isArray;
	date: typeof isDate;
	bigint: typeof isBigint;
	shape: typeof isShape;
	tuple: typeof isTuple;
	union: typeof isUnion;
	literal: typeof isLiteral;
	either: typeof isEither;
	clazz: typeof isClazz;
	to: typeof isTo;
	not: typeof not;
	optional: typeof optional;
}
export const is: IsTypes = {
	number: isNumber,
	string: isString,
	boolean: isBoolean,
	array: isArray,
	date: isDate,
	bigint: isBigint,
	shape: isShape,
	tuple: isTuple,
	union: isUnion,
	literal: isLiteral,
	either: isEither,
	clazz: isClazz,
	to: isTo,
	not,
	optional,
};

export type CreateTypeOf<F extends (...args: any[]) => any> = F extends (
	...args: any[]
) => infer R
	? R extends Predicate<infer T>
		? T
		: never
	: never;
