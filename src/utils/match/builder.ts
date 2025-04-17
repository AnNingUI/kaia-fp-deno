// deno-lint-ignore-file
import { Predicate } from "./is.ts";

type ShapeRegistry = Record<string, Record<string, Predicate<any>>>;

const createRegistry = (init?: ShapeRegistry): ShapeRegistry =>
	init ? structuredClone(init) : {};

function createShapeManager(initial?: ShapeRegistry) {
	let registry = createRegistry(initial);

	function defineShape<T>(name: string, shape: Predicate<T>): Predicate<T>;
	function defineShape<T>(
		group: string,
		name: string,
		shape: Predicate<T>
	): Predicate<T>;
	function defineShape<T>(
		arg1: string,
		arg2: string | Predicate<T>,
		arg3?: Predicate<T>
	): Predicate<T> {
		const next = createRegistry(registry);
		if (typeof arg2 === "function") {
			const name = arg1;
			const shape = arg2;
			next["default"] ??= {};
			next["default"][name] = shape;
			registry = next;
			return shape;
		} else {
			const group = arg1;
			const name = arg2;
			const shape = arg3!;
			next[group] ??= {};
			next[group][name] = shape;
			registry = next;
			return shape;
		}
	}

	function getShape<T>(name: string): Predicate<T> | undefined;
	function getShape<T>(group: string, name: string): Predicate<T> | undefined;
	function getShape<T>(arg1: string, arg2?: string): Predicate<T> | undefined {
		if (arg2 === undefined) {
			return registry["default"]?.[arg1] as Predicate<T> | undefined;
		} else {
			return registry[arg1]?.[arg2] as Predicate<T> | undefined;
		}
	}

	function cloneRegistry(): ShapeRegistry {
		return createRegistry(registry);
	}

	return {
		defineShape,
		getShape,
		cloneRegistry,
	};
}

// 默认全局实例（兼容用户旧代码）
const defaultManager = createShapeManager();

// 默认导出接口
export const defineShape = defaultManager.defineShape;
export const getShape = defaultManager.getShape;
export const cloneRegistry = defaultManager.cloneRegistry;

// 导出构造器供有需要的用户使用
export { createShapeManager };
