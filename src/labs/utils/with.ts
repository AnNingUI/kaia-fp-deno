export function initWith<T>(obj: T) {
	return {
		let(fn: (it: T) => void): T {
			fn(obj);
			return obj;
		},
		also(fn: (it: T) => void, transfer?: StructuredSerializeOptions): T {
			const clone = structuredClone(obj, transfer);
			fn(clone);
			return obj;
		},
	};
}

/**
 * @alias initWith
 */
export const iw = initWith;
