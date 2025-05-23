// deno-lint-ignore-file no-explicit-any
export type JSONSchema = {
	type?: string;
	properties?: Record<string, JSONSchema>;
	items?: JSONSchema;
	enum?: any[];
	oneOf?: JSONSchema[];
	default?: any;
	description?: string;
	required?: string[];
};

export function schemaFrom<T>(example: T): JSONSchema {
	const stack: any[] = [example];
	const schemas: JSONSchema[] = [];
	const processed = new WeakMap();

	while (stack.length > 0) {
		const current = stack.pop()!;

		if (processed.has(current)) {
			continue;
		}

		if (Array.isArray(current)) {
			const schema: JSONSchema = { type: "array" };
			processed.set(current, schema);
			if (current.length > 0) {
				stack.push(current);
				stack.push(current[0]);
				schemas.push(schema);
			}
		} else if (typeof current === "object" && current !== null) {
			const schema: JSONSchema = { type: "object", properties: {} };
			processed.set(current, schema);
			stack.push(current);
			schemas.push(schema);

			const entries = Object.entries(current).reverse();
			for (const [key, value] of entries) {
				stack.push(value);
				stack.push(key);
			}
		} else {
			schemas.push({ type: typeof current });
		}
	}

	return schemas[0];
}
