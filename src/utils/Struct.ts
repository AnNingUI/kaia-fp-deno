// deno-lint-ignore-file no-explicit-any
// 首先定义基础类型
type StructDefinition = Record<string, any>;

// 改进类型系统
type ConstructorToType<T> = T extends StringConstructor
	? string
	: T extends NumberConstructor
	? number
	: T extends BooleanConstructor
	? boolean
	: T extends ArrayConstructor
	? unknown[]
	: T extends StructType<infer R, infer M>
	? StructInstance<R, M>
	: T extends ObjectConstructor
	? object
	: T extends FunctionConstructor
	? (...args: unknown[]) => unknown
	: T extends { new (...args: unknown[]): infer R }
	? R // 处理类构造器
	: T extends StructDefinition
	? StructValue<T> // 处理结构体类型
	: never;

// 修正 StructValue 类型定义
export type StructValue<T extends StructDefinition> = {
	[K in keyof T]: ConstructorToType<T[K]>;
};

export type Definition<T> = T extends StructType<infer T, any> ? T : never;
export type SelfArgs<T> = StructValue<Definition<T>>;
export type InitArgs<T> = Partial<StructValue<Definition<T>>>;

// 改进方法类型定义
type DirectMethod<T, Args extends any[] = any[], R = any> = (
	self: T,
	...args: Args
) => R;

type FactoryMethod<T, Args extends any[] = any[], R = any> = () => (
	...args: Args
) => R;

type OnNew<T> = () => (self: T) => void;

type MethodMap<T extends StructValue<any>> = {
	[K: string]: DirectMethod<T> | FactoryMethod<T> | OnNew<T>;
};

// 提取方法的返回类型
type MethodReturnType<M> = M extends DirectMethod<any, any, infer R>
	? R
	: M extends FactoryMethod<any, any, infer R>
	? R
	: never;

// 改进结构体实例类型，添加方法声明
type StructInstance<
	T extends StructDefinition,
	M extends MethodMap<StructValue<T>> = Record<string, any>
> = StructValue<T> & {
	[K in keyof M]: M[K] extends DirectMethod<StructValue<T>, infer Args, infer R>
		? (...args: Args) => R
		: M[K] extends FactoryMethod<StructValue<T>, infer Args, infer R>
		? (...args: Args) => R
		: never;
} & {
	callMethod<K extends keyof M>(
		methodName: K,
		...args: Parameters<
			M[K] extends DirectMethod<StructValue<T>, infer Args, any>
				? (...args: Args) => any
				: M[K] extends FactoryMethod<StructValue<T>, infer Args, any>
				? (...args: Args) => any
				: never
		>
	): MethodReturnType<M[K]>;
};

// 存储全局方法实现
const globalMethodImplementations: Record<string, any> = {};

// 存储当前作用域的方法实现
const currentScopeImplementations: Record<string, any>[] = [];
type StructNew<
	T extends StructDefinition,
	M extends MethodMap<StructValue<T>> = Record<string, never>
> = (init: Partial<StructValue<T>>) => StructInstance<T, M>;
// 修改 StructType 定义
type StructType<
	T extends StructDefinition,
	M extends MethodMap<StructValue<T>> = Record<string, never>
> = {
	new: StructNew<T, M>;
	prototype: StructValue<T>;
};

class StructClass<T extends StructDefinition> {
	constructor(init: Partial<StructValue<T>>, definition: T) {
		for (const key in definition) {
			if (init !== null && Object.prototype.hasOwnProperty.call(init, key)) {
				(this as any)[key] = init[key];
			} else {
				const type = definition[key];
				(this as any)[key] = this.getDefaultValue(type);
			}
		}

		// 执行 onNew 方法
		const onNewMethod = this.getMethod("onNew");
		if (onNewMethod) {
			const onNewCallback = onNewMethod();
			if (typeof onNewCallback === "function") {
				onNewCallback(init);
			}
		}

		// 绑定方法到实例
		this.bindMethods();
	}

	private getDefaultValue(type: any): any {
		if (type === String) return "";
		if (type === Number) return 0;
		if (type === Boolean) return false;
		if (type === Array) return [];
		if (type === Object) return {};
		if (type === Function) return () => {};
		if (type && typeof type === "object") {
			if (type.$KAIA_TYPE$ === "Struct") {
				return type.new({});
			} else {
				return Struct(type).new({});
			}
		}
		if (typeof type === "function") {
			// 处理类构造器
			try {
				return new type();
			} catch {
				return null;
			}
		}
		// 处理结构体类型
		return null;
	}

	// 获取方法（检查当前作用域和全局作用域）
	private getMethod(methodName: string) {
		// 先检查当前作用域
		for (let i = currentScopeImplementations.length - 1; i >= 0; i--) {
			if (currentScopeImplementations[i][methodName]) {
				return currentScopeImplementations[i][methodName];
			}
		}

		// 再检查全局作用域
		if (globalMethodImplementations[methodName]) {
			return globalMethodImplementations[methodName];
		}

		return undefined;
	}

	// 调用方法的代理
	callMethod(methodName: string, ...args: any[]) {
		const method = this.getMethod(methodName);
		if (!method) {
			throw new Error(`Method ${methodName} is not implemented`);
		}

		// 如果是无参函数，执行它并获取回调
		if (method.length === 0) {
			const callback = method();
			if (typeof callback === "function") {
				return callback(...args);
			}
			return callback;
		}

		// 否则，直接调用方法
		return method(this as any, ...args);
	}

	// 添加代理方法到原型
	private bindMethods() {
		const methods = this.getAvailableMethods();
		for (const methodName of methods) {
			(this as any)[methodName] = (...args: any[]) => {
				return this.callMethod(methodName, ...args);
			};
		}
	}

	private getAvailableMethods(): string[] {
		const methods = new Set<string>();

		// 收集当前作用域的方法
		for (const scope of currentScopeImplementations) {
			Object.keys(scope).forEach((method) => methods.add(method));
		}

		// 收集全局作用域的方法
		Object.keys(globalMethodImplementations).forEach((method) =>
			methods.add(method)
		);

		return Array.from(methods);
	}
}
export function Struct<T extends StructDefinition>(
	definition: T
): StructType<T> {
	// 定义 new 方法
	const structInstance = {
		["$KAIA_TYPE$"]: "Struct",
		new: (init: Partial<StructValue<T>>) =>
			new StructClass(init, definition) as unknown as StructInstance<T>,
		prototype: StructClass.prototype,
	};
	return structInstance as unknown as StructType<T>;
}

export function Impl<
	T extends StructDefinition,
	M extends MethodMap<StructValue<T>> & { onNew?: OnNew<StructValue<T>> }
>(struct: StructType<T>, methods: M) {
	type Self = StructValue<T>;
	const typedMethods = Object.fromEntries(
		Object.entries(methods).map(([key, method]) => [
			key,
			typeof method === "function" && (method as DirectMethod<Self>).length > 0
				? (self: Self, ...args: any[]) =>
						(method as DirectMethod<Self>)(self, ...args)
				: method,
		])
	) as M;

	return { struct, methods: typedMethods };
}

// 修改 detectMethodConflicts 的实现
function detectMethodConflicts<T extends StructDefinition>(
	implementations: Array<{
		struct: StructType<T>;
		methods: MethodMap<StructValue<T>>;
	}>
): string[] {
	const conflicts: string[] = [];
	const methodSources = new Map<string, number>();

	// 仅检测来自不同实现的相同方法
	implementations.forEach((impl, index) => {
		Object.keys(impl.methods).forEach((methodName) => {
			if (methodSources.has(methodName)) {
				conflicts.push(methodName);
			} else {
				methodSources.set(methodName, index);
			}
		});
	});

	return conflicts;
}

export function FuncBox<
	T extends StructDefinition,
	M1 extends MethodMap<StructValue<T>>,
	M2 extends MethodMap<StructValue<T>>,
	R = void
>(
	implementations: [
		{ struct: StructType<T>; methods: M1 },
		{ struct: StructType<T>; methods: M2 }
	],
	callback: (As: (self: StructInstance<T>) => StructInstance<T, M1 & M2>) => R
): R {
	// 检测方法冲突但不立即抛出错误
	const conflicts = detectMethodConflicts(implementations);

	// 即使在严格模式下，也只是记录警告
	if (conflicts.length > 0) {
		console.warn(
			`Warning: Method implementation conflict detected. The following methods have multiple implementations: ${conflicts.join(
				", "
			)}. Using last implementation.`
		);
	}

	const scopeImpl: Record<string, any> = {};

	// 按照实现的顺序添加方法，后面的实现会覆盖前面的
	for (const impl of implementations) {
		for (const methodName in impl.methods) {
			scopeImpl[methodName] = impl.methods[methodName];
		}
	}

	currentScopeImplementations.push(scopeImpl);
	try {
		return callback((self) => {
			// 创建代理对象
			const proxy = Object.create(
				Object.getPrototypeOf(self)
			) as StructInstance<T, M1 & M2>;

			// 复制现有属性
			Object.assign(proxy, self);

			// 绑定所有可用方法
			for (const methodName in scopeImpl) {
				Object.defineProperty(proxy, methodName, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: (...args: any[]) =>
						self.callMethod(methodName as never, ...args),
				});
			}

			return proxy;
		});
	} finally {
		currentScopeImplementations.pop();
	}
}

type MultiStructImpl = {
	struct: StructType<any>;
	methods: MethodMap<StructValue<any>>;
};

type StructInstanceMap<T extends MultiStructImpl[]> = {
	[K in keyof T]: T[K] extends { struct: StructType<infer D> }
		? StructInstance<D, T[K]["methods"]>
		: never;
};

export function MultiFuncBox<T extends MultiStructImpl[], R = void>(
	implementations: [...T],
	callback: (
		As: <K extends keyof T>(
			self: T[K] extends { struct: StructType<infer D> }
				? StructInstance<D>
				: never,
			index: K
		) => StructInstanceMap<T>[K]
	) => R
): R {
	// 为每个结构体分别检查方法冲突
	const structMethodMap = new Map<StructType<any>, string[]>();
	implementations.forEach((impl) => {
		const conflicts = detectMethodConflicts([impl]);
		if (conflicts.length > 0) {
			structMethodMap.set(impl.struct, conflicts);
		}
	});

	// 修改冲突处理逻辑，类似于 FuncBox
	if (structMethodMap.size > 0) {
		const errorMessages = Array.from(structMethodMap.entries())
			.map(([_, conflicts]) => conflicts.join(", "))
			.join("; ");
		console.warn(
			`Warning: Method conflicts detected: ${errorMessages}. Using last implementation.`
		);
	}

	// 创建作用域实现映射
	const scopeImpl: Record<string, any> = {};
	implementations.forEach((impl) => {
		for (const methodName in impl.methods) {
			scopeImpl[methodName] = impl.methods[methodName];
		}
	});

	currentScopeImplementations.push(scopeImpl);
	try {
		return callback((self) => {
			const proxy = Object.create(self) as StructInstanceMap<T>[keyof T];

			// 复制原始对象的属性
			Object.assign(proxy, self);

			// 绑定方法
			const methods = Object.keys(scopeImpl);
			methods.forEach((methodName) => {
				const method = ((...args: any[]) => {
					return (self as any).callMethod(methodName, ...args);
				}) as any;

				// 保持原始方法的类型信息
				Object.defineProperty(proxy, methodName, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: method,
				});
			});

			return proxy;
		});
	} finally {
		currentScopeImplementations.pop();
	}
}

export function WithStruct<
	T extends StructDefinition,
	M extends MethodMap<StructValue<T>> & { onNew?: OnNew<StructValue<T>> }
>(definition: T, methods: M): StructType<T, M> {
	const struct = Struct(definition);

	// 将方法添加到全局作用域
	for (const methodName in methods) {
		globalMethodImplementations[methodName] = methods[methodName];
	}

	// 将方法添加到结构体原型
	for (const methodName in methods) {
		(struct.prototype as any)[methodName] = function (...args: any[]) {
			return this.callMethod(methodName, ...args);
		};
	}

	return struct as StructType<T, M>;
}

// ---------------------------------------------------------------------

// type User2Definition = {
// 	name: StringConstructor;
// 	age: NumberConstructor;
// 	email: StringConstructor;
// };

// const Profile = WithStruct(
// 	{
// 		avatar: String,
// 		bio: String,
// 	},
// 	{
// 		setAvatar: (self, avatar: string) => {
// 			self.avatar = avatar;
// 		},
// 		setBio: (self, bio: string) => {
// 			self.bio = bio;
// 		},
// 	}
// );

// // 示例代码测试
// const User = Struct({
// 	name: String,
// 	age: Number,
// 	email: String,
// 	profile: Profile.Constructor,
// 	tags: Array,
// 	validate: Function,
// }); // { name: StringConstructor; age: NumberConstructor; email: StringConstructor; profile: typeof Profile.Constructor; tags: ArrayConstructor; validate: FunctionConstructor; }

// // 现在方法实现会有更好的类型提示
// const UserImpl_1 = Impl(User, {
// 	setName: (self, name: string) => {
// 		self.name = name.toUpperCase(); // 第一个实现：转大写
// 	},
// 	getInfo: (self) => {
// 		return `Name: ${self.name}, Age: ${self.age}, Email: ${self.email}`;
// 	},
// 	tag: () => () => "User",
// 	of: () => (name: string, age: number, email: string) =>
// 		User.new({ name, age, email }),
// } as const);

// const UserImpl_2 = Impl(User, {
// 	setName: (self, name: string) => {
// 		self.name = name.toLowerCase(); // 第二个实现：转小写
// 	},
// 	setEmail: (self, id: number) => {
// 		self.email = `user${id}@example.com`;
// 	},
// 	birthday: (self) => {
// 		self.age += 1;
// 	},
// } as const);

// // 创建用户实例
// const user = User.new({
// 	name: "Alice",
// 	age: 25,
// 	email: "alice@example.com",
// });

// // 尝试在函数域外调用方法（应该失败）
// try {
// 	// @ts-ignore
// 	user.setName("Bob"); // 这应该抛出错误
// } catch (e) {
// 	console.error((e as Error).message); // 输出: user.setName is not a function. (In 'user.setName("Bob")', 'user.setName' is undefined)
// }

// // 使用严格模式（默认）- 会抛出错误
// try {
// 	FuncBox([UserImpl_1, UserImpl_2], (As) => {
// 		const as_user = As(user);
// 		as_user.setName("Bob");
// 	});
// } catch (e) {
// 	console.error("Strict mode error:", (e as Error).message);
// }

// // 使用非严格模式 - 使用最后一个实现
// FuncBox(
// 	[UserImpl_1, UserImpl_2],
// 	(As) => {
// 		const as_user = As(user);
// 		as_user.setName("Bob"); // 将使用 UserImpl_2 的实现（转小写）
// 	},
// 	{ strict: false }
// );

// // 在函数域内调用方法
// FuncBox([UserImpl_1, UserImpl_2], (As) => {
// 	const as_user = As(user);
// 	as_user.setEmail(123);
// 	as_user.birthday();
// 	console.log(as_user.getInfo()); // 输出: Name: Bob, Age: 26, Email: user123@example.com
// });

// // 使用示例：返回值
// const result = FuncBox(
// 	[UserImpl_1, UserImpl_2],
// 	(As) => {
// 		const as_user = As(user);
// 		as_user.setName("Bob");
// 		return as_user.getInfo(); // 现在可以返回值
// 	},
// 	{ strict: false }
// );
// console.log("Return value:", result);

// // 修改 User2 定义
// const User2 = WithStruct(
// 	{
// 		name: String,
// 		age: Number,
// 		email: String,
// 	},
// 	{
// 		onNew: () => (init: Partial<StructValue<User2Definition>>) => {
// 			console.log(`User2 created: ${init.name}`);
// 		},
// 		setName: (self, name: string) => {
// 			self.name = name;
// 		},
// 		setEmail: (self, id: number) => {
// 			self.email = `user${id}@example.com`;
// 		},
// 	}
// );

// const user2 = User2.new({
// 	name: "Charlie",
// 	age: 30,
// 	email: "charlie@example.com",
// });

// // 对于User2，方法是全局可用的
// user2.setName("David");
// user2.setEmail(456);
// console.log(user2.name); // 输出: David
// console.log(user2.email); // 输出: user456@example.com

// // 添加 PetDefinition 类型
// type PetDefinition = {
// 	name: StringConstructor;
// 	species: StringConstructor;
// 	age: NumberConstructor;
// };

// // 修改 Pet 结构体定义
// const Pet = Struct<PetDefinition>({
// 	name: String,
// 	species: String,
// 	age: Number,
// });

// // 修改 PetImpl 定义，使用正确的类型
// const PetImpl = Impl(Pet, {
// 	makeSound: (self: StructValue<PetDefinition>) => {
// 		console.log(`${self.name} makes a sound!`);
// 	},
// } as const);

// // 使用示例
// const user3 = User.new({
// 	name: "Alice",
// 	age: 25,
// 	email: "alice@example.com",
// });

// const pet = Pet.new({
// 	name: "Fluffy",
// 	species: "Cat",
// 	age: 3,
// });

// // MultiFuncBox 返回值示例
// const multiResult = MultiFuncBox(
// 	[UserImpl_1, UserImpl_2, PetImpl],
// 	(As) => {
// 		const as_user = As(user3, 0);
// 		const as_pet = As(pet, 2);

// 		as_user.setName("Bob");
// 		as_pet.makeSound();

// 		return {
// 			userInfo: as_user.getInfo(),
// 			petName: as_pet.name,
// 		};
// 	},
// 	{ strict: false }
// );
// console.log("Multi return value:", multiResult);
