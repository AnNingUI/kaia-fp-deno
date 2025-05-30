// NodeManager.ts

export class Node<K, V> {
	key: K;
	value: V;
	prev: Node<K, V> | null = null;
	next: Node<K, V> | null = null;
	createdAt: number;

	constructor(key: K, value: V, createdAt: number) {
		this.key = key;
		this.value = value;
		this.createdAt = createdAt;
	}
}

export class NodePool<K, V> {
	private pool: Node<K, V>[] = [];

	acquire(key: K, value: V, createdAt: number): Node<K, V> {
		const node = this.pool.pop();
		if (node) {
			node.key = key;
			node.value = value;
			node.prev = null;
			node.next = null;
			node.createdAt = createdAt;
			return node;
		}
		return new Node(key, value, createdAt);
	}

	release(node: Node<K, V>) {
		// 清理避免内存泄漏
		(node.key as any) = null;
		(node.value as any) = null;
		node.prev = null;
		node.next = null;
		node.createdAt = 0;
		this.pool.push(node);
	}

	clear() {
		this.pool.length = 0;
	}
}
