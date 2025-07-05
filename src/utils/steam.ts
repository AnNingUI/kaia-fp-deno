// deno-lint-ignore-file no-explicit-any
export class Stream<T> {
	private readonly generator: () => Generator<T>;
	private _length: number | null = null; // 惰性计算长度

	private constructor(generator: () => Generator<T>) {
		this.generator = generator;
	}

	static fromArray<T>(arr: T[]): Stream<T> {
		return new Stream(function* () {
			for (const item of arr) yield item;
		});
	}

	static empty<T>(): Stream<T> {
		return new Stream(function* () {});
	}

	static cons<T>(head: T, tail: () => Stream<T>): Stream<T> {
		return new Stream(function* () {
			yield head;
			yield* tail().generator();
		});
	}

	// 核心迭代逻辑
	protected *iterate(): Generator<T> {
		yield* this.generator();
	}

	// 惰性计算长度
	get length(): number | undefined {
		if (this._length === null) return undefined;
		return this._length;
	}

	// 新增带默认值的length方法
	lengthOrDefault(defaultValue: number): number {
		return this.length ?? defaultValue;
	}

	// 预计算长度并缓存
	materialize(): Stream<T> {
		const arr = this.toArray();
		return new Stream(function* () {
			yield* arr;
		}).setLength(arr.length);
	}

	// 私有方法用于设置长度
	private setLength(length: number): this {
		(this as any)._length = length;
		return this;
	}

	// 无递归的 map 实现
	map<Y>(f: (x: T) => Y): Stream<Y> {
		return new Stream(
			function* (this: Stream<T>) {
				for (const item of this.iterate()) yield f(item);
			}.bind(this)
		);
	}

	// 基于迭代的 filter
	filter(f: (x: T) => boolean): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				for (const item of this.iterate()) {
					if (f(item)) yield item;
				}
			}.bind(this)
		);
	}

	// 高效 take 实现 (O(n))
	take(n: number): T[] {
		const result: T[] = [];
		const iter = this.iterate();
		for (let i = 0; i < n; i++) {
			const { value, done } = iter.next();
			if (done) break;
			result.push(value);
		}
		return result;
	}

	// 修复的 scanRight (从右向左计算)
	scanRight<R>(f: (cur: T, acc: R) => R, init: R): Stream<R> {
		const arr = this.toArray();
		let acc = init;
		return Stream.fromArray(
			arr
				.reverse()
				.map((item) => (acc = f(item, acc)))
				.reverse()
		);
	}

	// 修复的 dropWhile
	dropWhile(f: (x: T) => boolean): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter = this.iterate();
				let dropping = true;
				while (true) {
					const { value, done } = iter.next();
					if (done) break;
					if (dropping && !f(value)) dropping = false;
					if (!dropping) yield value;
				}
			}.bind(this)
		);
	}

	// 合并 append 和 concat
	concat(other: Stream<T>): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				yield* this.iterate();
				yield* other.iterate();
			}.bind(this)
		);
	}

	// 避免类型强转的 flatten
	flatten<Y>(this: Stream<Stream<Y>>): Stream<Y> {
		return new Stream(
			function* (this: Stream<Stream<Y>>) {
				for (const inner of this.iterate()) {
					yield* inner.iterate();
				}
			}.bind(this)
		);
	}

	// 其他关键方法优化
	toArray(): T[] {
		return Array.from(this.iterate());
	}

	// 内存安全的 partition
	partition(f: (x: T) => boolean): [Stream<T>, Stream<T>] {
		const left: T[] = [];
		const right: T[] = [];
		for (const item of this.iterate()) {
			(f(item) ? left : right).push(item);
		}
		return [Stream.fromArray(left), Stream.fromArray(right)];
	}

	forEach(f: (x: T) => void): void {
		for (const item of this.iterate()) {
			f(item);
		}
	}

	reduce<R>(f: (acc: R, cur: T) => R, init: R): R {
		let acc = init;
		for (const item of this.iterate()) {
			acc = f(acc, item);
		}
		return acc;
	}

	find(f: (x: T) => boolean): T | undefined {
		for (const item of this.iterate()) {
			if (f(item)) {
				return item;
			}
		}
		return undefined;
	}

	every(f: (x: T) => boolean): boolean {
		for (const item of this.iterate()) {
			if (!f(item)) {
				return false;
			}
		}
		return true;
	}

	some(f: (x: T) => boolean): boolean {
		for (const item of this.iterate()) {
			if (f(item)) {
				return true;
			}
		}
		return false;
	}

	takeWhile(f: (x: T) => boolean): T[] {
		const result: T[] = [];
		const iter = this.iterate();
		while (true) {
			const { value, done } = iter.next();
			if (done || !f(value)) break;
			result.push(value);
		}
		return result;
	}

	zipWith<Y, Z>(other: Stream<Y>, f: (a: T, b: Y) => Z): Stream<Z> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();
				while (true) {
					const res1 = iter1.next();
					const res2 = iter2.next();
					if (res1.done || res2.done) break;
					yield f(res1.value, res2.value);
				}
			}.bind(this)
		);
	}

	interleave<Y>(other: Stream<Y>): Stream<T | Y> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = iter1.next();
					const res2 = iter2.next();

					if (res1.done || res2.done) break;

					yield res1.value;
					yield res2.value;
				}
			}.bind(this)
		);
	}

	// 扁平映射
	flatMap<Y>(f: (x: T) => Stream<Y>): Stream<Y> {
		return new Stream(
			function* (this: Stream<T>) {
				for (const item of this.iterate()) {
					yield* f(item).iterate();
				}
			}.bind(this)
		);
	}

	memoize(): Stream<T> {
		let cached: T[] | null = null;
		return new Stream(
			function* (this: Stream<T>) {
				if (cached === null) {
					cached = this.toArray();
				}
				yield* cached;
			}.bind(this)
		);
	}

	// 优化map与filter的组合操作
	mapFilter<Y>(f: (x: T) => Y | null): Stream<Y> {
		return new Stream(
			function* (this: Stream<T>) {
				for (const item of this.iterate()) {
					const result = f(item);
					if (result !== null) yield result;
				}
			}.bind(this)
		);
	}

	// 去重
	// 优化distinct方法，添加TTL过期机制
	distinct(maxSize: number = 1000, ttlMs: number = 60000): Stream<T> {
		const seen = new Map<T, { value: T; timestamp: number }>();

		return new Stream(
			function* (this: Stream<T>) {
				const now = Date.now();
				// 清理过期记录
				for (const [key, item] of seen.entries()) {
					if (now - item.timestamp > ttlMs) {
						seen.delete(key);
					}
				}

				for (const item of this.iterate()) {
					const existing = seen.get(item);
					if (existing === undefined) {
						seen.set(item, { value: item, timestamp: now });
						yield item;
					} else {
						seen.set(item, { value: item, timestamp: now }); // 更新时间戳
					}

					// 清理超出容量的记录
					if (seen.size > maxSize) {
						const oldest = [...seen.entries()].reduce((a, b) =>
							a[1].timestamp < b[1].timestamp ? a : b
						)[0];
						seen.delete(oldest);
					}
				}
			}.bind(this)
		);
	}

	// 排序
	sorted(compareFn?: (a: T, b: T) => number): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const arr = this.toArray();
				arr.sort(compareFn);
				yield* arr;
			}.bind(this)
		);
	}

	// 合并流（不保证顺序）
	merge(other: Stream<T>): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = iter1.next();
					const res2 = iter2.next();
					if (res1.done && res2.done) break;

					if (!res1.done) yield res1.value;
					if (!res2.done) yield res2.value;
				}
			}.bind(this)
		);
	}

	// 自定义合并逻辑
	mergeWith(fn: (a: T, b: T) => T, other: Stream<T>): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = iter1.next();
					const res2 = iter2.next();
					if (res1.done || res2.done) break;

					yield fn(res1.value, res2.value);
				}
			}.bind(this)
		);
	}

	// 元组配对
	zip(other: Stream<T>): Stream<[T, T]> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = iter1.next();
					const res2 = iter2.next();
					if (res1.done || res2.done) break;

					yield [res1.value, res2.value];
				}
			}.bind(this)
		) as Stream<[T, T]>;
	}

	// 包含检查
	includes(value: T): boolean {
		for (const item of this.iterate()) {
			if (item === value) return true;
		}
		return false;
	}

	// 条件计数
	count(f: (x: T) => boolean): number {
		let count = 0;
		for (const item of this.iterate()) {
			if (f(item)) count++;
		}
		return count;
	}

	// 最小值
	min(comparator?: (a: T, b: T) => number): T | undefined {
		const arr = this.toArray();
		if (arr.length === 0) return undefined;
		return arr.reduce((min, current) =>
			comparator
				? comparator(min, current) < 0
					? min
					: current
				: min < current
				? min
				: current
		);
	}

	// 最大值
	max(comparator?: (a: T, b: T) => number): T | undefined {
		const arr = this.toArray();
		if (arr.length === 0) return undefined;
		return arr.reduce((max, current) =>
			comparator
				? comparator(max, current) > 0
					? max
					: current
				: max > current
				? max
				: current
		);
	}

	// 条件截取
	takeUntil(f: (x: T) => boolean): T[] {
		const result: T[] = [];
		const iter = this.iterate();
		while (true) {
			const { value, done } = iter.next();
			if (done) break;
			result.push(value);
			if (f(value)) break;
		}
		return result;
	}

	// 跳过元素
	drop(n: number): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter = this.iterate();
				let count = 0;
				while (count++ < n) {
					if (iter.next().done) return;
				}
				yield* iter;
			}.bind(this)
		);
	}

	// 条件跳过
	dropUntil(f: (x: T) => boolean): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter = this.iterate();
				let found = false;
				while (true) {
					const { value, done } = iter.next();
					if (done) break;
					if (!found && f(value)) found = true;
					if (found) yield value;
				}
			}.bind(this)
		);
	}

	// 副作用操作
	tap(f: (x: T) => void): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				for (const item of this.iterate()) {
					f(item);
					yield item;
				}
			}.bind(this)
		);
	}

	// 异步映射
	asyncMap<Y>(f: (x: T) => Promise<Y>): AsyncStream<Y> {
		return AsyncStream.create(
			async function* (this: Stream<T>) {
				for (const item of this.iterate()) {
					try {
						yield await f(item);
					} catch (error) {
						throw error; // 抛出错误终止流
					}
				}
			}.bind(this)
		);
	}

	// 异步过滤
	asyncFilter(f: (x: T) => Promise<boolean>): AsyncStream<T> {
		return AsyncStream.create(
			async function* (this: Stream<T>) {
				for (const item of this.iterate()) {
					if (await f(item)) yield item;
				}
			}.bind(this)
		);
	}

	// 节流操作
	throttle(timeMs: number): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter = this.iterate();
				let lastTime = 0;
				let pending: T | null = null;

				while (true) {
					const { value, done } = iter.next();
					if (done) {
						if (pending !== null) yield pending;
						break;
					}

					pending = value;
					const now = Date.now();
					if (now - lastTime >= timeMs) {
						yield value;
						lastTime = now;
						pending = null;
					}
				}
			}.bind(this)
		);
	}

	// 防抖操作
	debounce(timeMs: number): Stream<T> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter = this.iterate();
				let timeout: number | null = null;
				let pending: T | null = null;

				const triggerYield = function* () {
					if (pending !== null) {
						yield pending;
						pending = null;
					}
				};

				while (true) {
					const { value, done } = iter.next();
					if (done) {
						if (pending !== null) yield pending;
						break;
					}

					pending = value;

					if (timeout) clearTimeout(timeout);

					timeout = setTimeout(() => {
						triggerYield();
					}, timeMs);

					// 模拟异步等待，防止频繁触发
					const wait = new Promise<void>((resolve) => {
						timeout = setTimeout(resolve, 0);
					});

					wait.then(() => {});
				}
			}.bind(this)
		);
	}

	// 转换为Promise
	toPromise(): Promise<T[]> {
		return new Promise((resolve) => {
			const result: T[] = [];
			for (const item of this.iterate()) {
				result.push(item);
			}
			resolve(result);
		});
	}

	*toIterate(): Generator<T> {
		for (const item of this.iterate()) {
			yield item;
		}
	}

	// 分块处理
	chunk(size: number): Stream<T[]> {
		return new Stream(
			function* (this: Stream<T>) {
				const iter = this.iterate();
				let chunk: T[] = [];
				while (true) {
					const { value, done } = iter.next();
					if (done) {
						if (chunk.length > 0) yield chunk;
						break;
					}
					chunk.push(value);
					if (chunk.length === size) {
						yield chunk;
						chunk = [];
					}
				}
			}.bind(this)
		);
	}

	// 分组操作
	groupBy<Key>(keySelector: (x: T) => Key): Stream<[Key, Stream<T>]> {
		const groups = new Map<Key, T[]>();

		for (const item of this.iterate()) {
			const key = keySelector(item);
			if (!groups.has(key)) {
				groups.set(key, []);
			}
			groups.get(key)!.push(item);
		}

		return Stream.fromArray(
			[...groups.entries()].map(([key, items]) => [
				key,
				Stream.fromArray(items),
			])
		);
	}

	// 窗口操作
	window(size: number, slide: number = size): Stream<Stream<T>> {
		if (size <= 0 || slide <= 0) {
			throw new Error("Window size and slide must be positive");
		}

		return new Stream(
			function* (this: Stream<T>) {
				const iter = this.iterate();
				const window: T[] = [];
				let count = 0;

				while (true) {
					const { value, done } = iter.next();
					if (done) {
						if (window.length > 0) yield Stream.fromArray(window);
						break;
					}

					window.push(value);
					count++;

					if (count >= size) {
						yield Stream.fromArray([...window]);
						if (window.length >= slide) {
							window.splice(0, slide);
							count -= slide;
						}
					}
				}
			}.bind(this)
		);
	}

	// 深度展平
	flattenDeep(this: Stream<any>): Stream<any> {
		return new Stream(
			function* (this: Stream<any>) {
				for (const item of this.iterate()) {
					if (item instanceof Stream) {
						yield* item.flattenDeep().iterate();
					} else if (Array.isArray(item)) {
						yield* Stream.fromArray(item).flattenDeep().iterate();
					} else {
						yield item;
					}
				}
			}.bind(this)
		);
	}

	// 调试辅助
	onEach(f: (x: T) => void): Stream<T> {
		return this.tap(f);
	}
}

export class AsyncStream<T> {
	private readonly generator: () => AsyncGenerator<T>;
	private _length: number | null = null; // 惰性计算长度

	/**
	 * 私有构造函数，确保只能通过静态方法创建实例
	 */
	private constructor(generator: () => AsyncGenerator<T>) {
		this.generator = generator;
	}

	/* -------------------- 静态工厂方法 -------------------- */

	/**
	 * 从数组创建异步流
	 */
	static fromArray<T>(arr: T[]): AsyncStream<T> {
		return new AsyncStream(async function* () {
			for (const item of arr) {
				yield item;
			}
		});
	}

	/**
	 * 创建空的异步流
	 */
	static empty<T>(): AsyncStream<T> {
		return new AsyncStream(async function* () {});
	}

	/**
	 * 从头部元素和尾部流构造异步流
	 */
	static cons<T>(head: T, tail: () => AsyncStream<T>): AsyncStream<T> {
		return new AsyncStream(async function* () {
			yield head;
			yield* tail().generator();
		});
	}

	static create<T>(generator: () => AsyncGenerator<T>): AsyncStream<T> {
		return new AsyncStream(generator);
	}

	/**
	 * 从普通Stream转换为AsyncStream
	 */
	static fromStream<T>(stream: Stream<T>): AsyncStream<T> {
		return AsyncStream.create(
			async function* () {
				for await (const item of stream.toIterate()) {
					yield item;
				}
			}.bind(this)
		);
	}

	/* -------------------- 核心迭代方法 -------------------- */

	/**
	 * 异步迭代器的核心实现
	 */
	private async *iterate(): AsyncGenerator<T> {
		yield* this.generator();
	}

	/* -------------------- 基础属性和方法 -------------------- */

	/**
	 * 惰性计算流的长度
	 */
	get length(): Promise<number> {
		if (this._length !== null) {
			return Promise.resolve(this._length);
		}

		return new Promise((resolve) => {
			const countItems = async () => {
				let count = 0;
				for await (const _ of this.iterate()) {
					count++;
				}
				this._length = count;
				resolve(count);
			};

			countItems();
		});
	}

	/**
	 * 转换为数组
	 */
	async toArray(): Promise<T[]> {
		const result: T[] = [];
		for await (const item of this.iterate()) {
			result.push(item);
		}
		return result;
	}

	/**
	 * 异步遍历每个元素
	 */
	async forEach(f: (x: T) => Promise<void>): Promise<void> {
		for await (const item of this.iterate()) {
			await f(item);
		}
	}

	/**
	 * 异步归约操作
	 */
	async reduce<R>(f: (acc: R, cur: T) => Promise<R>, init: R): Promise<R> {
		let acc = init;
		for await (const item of this.iterate()) {
			acc = await f(acc, item);
		}
		return acc;
	}

	/**
	 * 查找符合条件的第一个元素
	 */
	async find(f: (x: T) => Promise<boolean>): Promise<T | undefined> {
		for await (const item of this.iterate()) {
			if (await f(item)) {
				return item;
			}
		}
		return undefined;
	}

	/**
	 * 检查所有元素是否都满足条件
	 */
	async every(f: (x: T) => Promise<boolean>): Promise<boolean> {
		for await (const item of this.iterate()) {
			if (!(await f(item))) {
				return false;
			}
		}
		return true;
	}

	/**
	 * 检查是否有元素满足条件
	 */
	async some(f: (x: T) => Promise<boolean>): Promise<boolean> {
		for await (const item of this.iterate()) {
			if (await f(item)) {
				return true;
			}
		}
		return false;
	}

	/* -------------------- 转换操作 -------------------- */

	/**
	 * 异步映射操作
	 */
	map<Y>(f: (x: T) => Y): AsyncStream<Y> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				for await (const item of this.iterate()) {
					yield f(item);
				}
			}.bind(this)
		);
	}

	/**
	 * 异步映射操作（处理Promise返回值）
	 */
	// 异步映射
	asyncMap<Y>(f: (x: T) => Promise<Y>): AsyncStream<Y> {
		return AsyncStream.create(
			async function* (this: AsyncStream<T>) {
				for await (const item of this.iterate()) {
					try {
						yield await f(item);
					} catch (error) {
						// 触发错误回调，可通过onError方法设置
						(this as any).handleError?.(error);
					}
				}
			}.bind(this)
		);
	}

	// 添加错误处理钩子
	onError(handler: (error: any) => void): this {
		(this as any).handleError = handler;
		return this;
	}

	// 新增重试机制
	retry(times: number = 3): AsyncStream<T> {
		return AsyncStream.create(
			async function* (this: AsyncStream<T>) {
				const iter = this.iterate();
				while (true) {
					let attempt = 0;
					let error: any;
					while (attempt < times) {
						attempt++;
						try {
							const { value, done } = await iter.next();
							if (done) return;
							yield value;
							error = undefined;
							break;
						} catch (err) {
							error = err;
							await new Promise((resolve) =>
								setTimeout(resolve, 100 * attempt)
							); // 指数退避
						}
					}
					if (error) throw error;
				}
			}.bind(this)
		);
	}

	/**
	 * 异步过滤操作
	 */
	filter(f: (x: T) => Promise<boolean>): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				for await (const item of this.iterate()) {
					if (await f(item)) {
						yield item;
					}
				}
			}.bind(this)
		);
	}

	/**
	 * 截取前n个元素
	 */
	async take(n: number): Promise<T[]> {
		const result: T[] = [];
		const iter = this.iterate();
		for (let i = 0; i < n; i++) {
			const { value, done } = await iter.next();
			if (done) break;
			result.push(value);
		}
		return result;
	}

	/**
	 * 跳过前n个元素
	 */
	drop(n: number): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter = this.iterate();
				let count = 0;
				while (count++ < n) {
					if ((await iter.next()).done) return;
				}
				yield* iter;
			}.bind(this)
		);
	}

	/* -------------------- 高级操作 -------------------- */

	/**
	 * 从右向左扫描
	 */
	async scanRight<R>(
		f: (cur: T, acc: R) => Promise<R>,
		init: R
	): Promise<AsyncStream<R>> {
		const arr = await this.toArray();
		let acc = init;
		const result = arr.reverse().map(async (item) => {
			acc = await f(item, acc);
			return acc;
		});
		const resolvedResult = await Promise.all(result); // 解包 Promise<R>[] -> R[]
		return AsyncStream.fromArray(resolvedResult.reverse());
	}

	/**
	 * 当条件为真时跳过元素
	 */
	dropWhile(f: (x: T) => Promise<boolean>): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter = this.iterate();
				let dropping = true;
				while (true) {
					const { value, done } = await iter.next();
					if (done) break;
					if (dropping && !(await f(value))) dropping = false;
					if (!dropping) yield value;
				}
			}.bind(this)
		);
	}

	/**
	 * 合并两个异步流
	 */
	concat(other: AsyncStream<T>): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				yield* this.iterate();
				yield* other.iterate();
			}.bind(this)
		);
	}

	/**
	 * 展平嵌套的异步流
	 */
	flatten<Y>(this: AsyncStream<AsyncStream<Y>>): AsyncStream<Y> {
		return new AsyncStream(
			async function* (this: AsyncStream<AsyncStream<Y>>) {
				for await (const inner of this.iterate()) {
					yield* inner.iterate();
				}
			}.bind(this)
		);
	}

	/* -------------------- 集合操作 -------------------- */

	/**
	 * 分区操作
	 */
	async partition(
		f: (x: T) => Promise<boolean>
	): Promise<[AsyncStream<T>, AsyncStream<T>]> {
		const left: T[] = [];
		const right: T[] = [];
		for await (const item of this.iterate()) {
			((await f(item)) ? left : right).push(item);
		}
		return [AsyncStream.fromArray(left), AsyncStream.fromArray(right)];
	}

	/**
	 * 查找是否包含某个值
	 */
	async includes(value: T): Promise<boolean> {
		for await (const item of this.iterate()) {
			if (item === value) return true;
		}
		return false;
	}

	/**
	 * 条件计数
	 */
	async count(f: (x: T) => Promise<boolean>): Promise<number> {
		let count = 0;
		for await (const item of this.iterate()) {
			if (await f(item)) count++;
		}
		return count;
	}

	/* -------------------- 排序和归约 -------------------- */

	/**
	 * 计算最小值
	 */
	async min(
		comparator?: (a: T, b: T) => number,
		defaultValue?: T
	): Promise<T | undefined> {
		const arr = await this.toArray();
		if (arr.length === 0) return defaultValue;
		return arr.reduce((min, current) =>
			comparator
				? comparator(min, current) < 0
					? min
					: current
				: min < current
				? min
				: current
		);
	}

	// 检测无限流的辅助方法
	async isFinite(): Promise<boolean> {
		// 尝试读取1000个元素，超时则认为是无限流
		let count = 0;
		const iter = this.iterate();

		while (count < 1000) {
			const { done } = await iter.next();
			if (done) return true;
			count++;
		}

		return false;
	}

	// 处理无限流的take操作
	async safeTake(n: number): Promise<T[]> {
		if (await this.isFinite()) {
			return this.take(n);
		}

		const result: T[] = [];
		const iter = this.iterate();
		for (let i = 0; i < n; i++) {
			const { value, done } = await iter.next();
			if (done) break;
			result.push(value);
		}
		return result;
	}

	/**
	 * 计算最大值
	 */
	async max(
		comparator?: (a: T, b: T) => Promise<number>
	): Promise<T | undefined> {
		const arr = await this.toArray();
		if (arr.length === 0) return undefined;

		let maxItem = arr[0];
		for (let i = 1; i < arr.length; i++) {
			const current = arr[i];
			if (comparator) {
				const result = await comparator(maxItem, current);
				if (result < 0) {
					maxItem = current;
				}
			} else {
				if (current > maxItem) {
					maxItem = current;
				}
			}
		}
		return maxItem;
	}

	/* -------------------- 拉链和合并 -------------------- */

	/**
	 * 拉链操作（元素配对）
	 */
	zip<Y>(other: AsyncStream<Y>): AsyncStream<[T, Y]> {
		return AsyncStream.create(
			async function* (this: AsyncStream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = await iter1.next();
					const res2 = await iter2.next();
					if (res1.done || res2.done) break;
					yield [res1.value, res2.value];
				}
			}.bind(this)
		) as AsyncStream<[T, Y]>;
	}

	/**
	 * 带自定义函数的拉链操作
	 */
	zipWith<Y, Z>(other: AsyncStream<Y>, f: (a: T, b: Y) => Z): AsyncStream<Z> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = await iter1.next();
					const res2 = await iter2.next();
					if (res1.done || res2.done) break;
					yield f(res1.value, res2.value);
				}
			}.bind(this)
		);
	}

	/**
	 * 交替合并两个流
	 */
	interleave<Y>(other: AsyncStream<Y>): AsyncStream<T | Y> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = await iter1.next();
					const res2 = await iter2.next();

					if (res1.done || res2.done) break;

					yield res1.value;
					yield res2.value;
				}
			}.bind(this)
		);
	}

	/**
	 * 扁平映射
	 */
	flatMap<Y>(f: (x: T) => AsyncStream<Y>): AsyncStream<Y> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				for await (const item of this.iterate()) {
					yield* f(item).iterate();
				}
			}.bind(this)
		);
	}

	/* -------------------- 高级流操作 -------------------- */

	/**
	 * 去重操作
	 */
	distinct(): AsyncStream<T> {
		const seen = new Set<T>();
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				for await (const item of this.iterate()) {
					if (!seen.has(item)) {
						seen.add(item);
						yield item;
					}
				}
			}.bind(this)
		);
	}

	/**
	 * 排序操作
	 */
	sorted(compareFn?: (a: T, b: T) => number): AsyncStream<T> {
		return new AsyncStream(() => this.sortGenerator(compareFn));
	}

	private async *sortGenerator(
		compareFn?: (a: T, b: T) => number
	): AsyncGenerator<T> {
		const arr = await this.toArray();
		arr.sort(compareFn);
		yield* arr;
	}

	/**
	 * 合并两个流（不保证顺序）
	 */
	merge(other: AsyncStream<T>): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = await iter1.next();
					const res2 = await iter2.next();
					if (res1.done && res2.done) break;

					if (!res1.done) yield res1.value;
					if (!res2.done) yield res2.value;
				}
			}.bind(this)
		);
	}

	/**
	 * 带自定义合并逻辑的合并操作
	 */
	mergeWith(
		fn: (a: T, b: T) => Promise<T>,
		other: AsyncStream<T>
	): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter1 = this.iterate();
				const iter2 = other.iterate();

				while (true) {
					const res1 = await iter1.next();
					const res2 = await iter2.next();
					if (res1.done || res2.done) break;

					yield await fn(res1.value, res2.value);
				}
			}.bind(this)
		);
	}

	/* -------------------- 条件操作 -------------------- */

	/**
	 * 当条件为真时截取元素
	 */
	async takeWhile(f: (x: T) => Promise<boolean>): Promise<T[]> {
		const result: T[] = [];
		const iter = this.iterate();
		while (true) {
			const { value, done } = await iter.next();
			if (done || !(await f(value))) break;
			result.push(value);
		}
		return result;
	}

	/**
	 * 截取到满足条件的元素为止
	 */
	async takeUntil(f: (x: T) => Promise<boolean>): Promise<T[]> {
		const result: T[] = [];
		const iter = this.iterate();
		while (true) {
			const { value, done } = await iter.next();
			if (done) break;
			result.push(value);
			if (await f(value)) break;
		}
		return result;
	}

	/**
	 * 当条件为真时跳过元素
	 */
	dropUntil(f: (x: T) => Promise<boolean>): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter = this.iterate();
				let found = false;
				while (true) {
					const { value, done } = await iter.next();
					if (done) break;
					if (!found && (await f(value))) found = true;
					if (found) yield value;
				}
			}.bind(this)
		);
	}

	/* -------------------- 副作用操作 -------------------- */

	/**
	 * 执行副作用操作并返回原流
	 */
	tap(f: (x: T) => Promise<void>): AsyncStream<T> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				for await (const item of this.iterate()) {
					await f(item);
					yield item;
				}
			}.bind(this)
		);
	}

	/**
	 * 调试辅助方法（等同于 tap）
	 */
	onEach(f: (x: T) => Promise<void>): AsyncStream<T> {
		return this.tap(f);
	}

	/* -------------------- 分块和深度展平 -------------------- */

	/**
	 * 分块处理流元素
	 */
	chunk(size: number): AsyncStream<T[]> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter = this.iterate();
				let chunk: T[] = [];
				while (true) {
					const { value, done } = await iter.next();
					if (done) {
						if (chunk.length > 0) yield chunk;
						break;
					}
					chunk.push(value);
					if (chunk.length === size) {
						yield chunk;
						chunk = [];
					}
				}
			}.bind(this)
		);
	}

	/**
	 * 深度展平嵌套的流或数组
	 */
	flattenDeep(): AsyncStream<any> {
		return AsyncStream.create(
			async function* (this: AsyncStream<any>) {
				const queue: any[] = [];

				const pushToQueue = async (item: any): Promise<void> => {
					if (item instanceof AsyncStream) {
						for await (const val of item.iterate()) {
							await pushToQueue(val);
						}
					} else if (Array.isArray(item)) {
						for (const val of item) {
							await pushToQueue(val);
						}
					} else {
						queue.push(item);
					}
				};

				for await (const item of this.iterate()) {
					await pushToQueue(item);
				}

				// 使用 for...of 遍历队列并 yield 每个元素
				for (const item of queue) {
					yield item;
				}
			}.bind(this)
		);
	}

	/* -------------------- 转换为 Promise -------------------- */

	/**
	 * 将流转换为 Promise
	 */
	toPromise(): Promise<T[]> {
		return this.toArray();
	}

	// 限制并发数的map操作
	concurrentMap<Y>(
		f: (x: T) => Promise<Y>,
		concurrency: number = 5
	): AsyncStream<Y> {
		return new AsyncStream(
			async function* (this: AsyncStream<T>) {
				const iter = this.iterate();
				const inflight: Array<Promise<Y>> = [];
				const results: Y[] = [];

				// 收集处理结果
				const capture = (promise: Promise<Y>) => {
					promise
						.then((value) => {
							results.push(value);
						})
						.catch((error) => {
							(this as any).handleError?.(error);
						});
				};

				// 控制并发
				while (true) {
					while (inflight.length < concurrency) {
						const { value, done } = await iter.next();
						if (done) break;
						const task = f(value);
						inflight.push(task);
						capture(task);
					}

					if (inflight.length === 0) break;

					// 等待至少一个任务完成
					await Promise.race(inflight);

					// 清除已完成的任务
					const newInflight: Array<Promise<Y>> = [];
					for (const p of inflight) {
						const settled = p.finally(() => {});
						if (settled !== p) {
							newInflight.push(p);
						}
					}
					inflight.length = 0;
					inflight.push(...newInflight);
				}

				// 等待剩余任务完成
				await Promise.allSettled(inflight);

				// 最终产出所有结果
				yield* results;
			}.bind(this)
		);
	}
}
