// deno-lint-ignore-file
type Node<K, V> = {
	key: K;
	value: V;
	prev: Node<K, V> | null;
	next: Node<K, V> | null;
	createdAt: number;
};

class NodePool<K, V> {
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
		return { key, value, prev: null, next: null, createdAt };
	}

	release(node: Node<K, V>) {
		// 清理以避免意外引用泄露
		node.key = null as any;
		node.value = null as any;
		node.prev = null;
		node.next = null;
		node.createdAt = 0;
		this.pool.push(node);
	}

	clear() {
		this.pool.length = 0;
	}
}

export class MiniLRUCache<K, V> {
	private map = new Map<K, Node<K, V>>();
	private head: Node<K, V> | null = null;
	private tail: Node<K, V> | null = null;
	private size = 0;

	private hits = 0;
	private misses = 0;

	private readonly nodePool = new NodePool<K, V>();

	constructor(
		private readonly max: number,
		private readonly ttl: number = 0 // 0 表示不启用 TTL
	) {}

	get(key: K): V | undefined {
		const node = this.map.get(key);
		if (!node) {
			this.misses++;
			return undefined;
		}

		const now = Date.now();
		if (this.ttl > 0 && now - node.createdAt > this.ttl) {
			this.removeInternal(node);
			this.misses++;
			return undefined;
		}

		this.hits++;
		if (node !== this.head) this.moveToFront(node);
		return node.value;
	}

	set(key: K, value: V): void {
		const now = Date.now();
		const existing = this.map.get(key);

		if (existing) {
			existing.value = value;
			existing.createdAt = now;
			if (existing !== this.head) this.moveToFront(existing);
		} else {
			const node = this.nodePool.acquire(key, value, now);
			this.map.set(key, node);
			this.addToFront(node);
			this.size++;

			if (this.size > this.max) this.evictLRU();
		}
	}

	remove(key: K): void {
		const node = this.map.get(key);
		if (node) this.removeInternal(node);
	}

	has(key: K): boolean {
		const node = this.map.get(key);
		if (!node) return false;

		const now = Date.now();
		if (this.ttl > 0 && now - node.createdAt > this.ttl) {
			this.removeInternal(node);
			return false;
		}

		return true;
	}

	clear(): void {
		for (const node of this.map.values()) this.nodePool.release(node);
		this.map.clear();
		this.head = this.tail = null;
		this.size = this.hits = this.misses = 0;
		this.nodePool.clear();
	}

	get hitRate(): number {
		const total = this.hits + this.misses;
		return total === 0 ? 0 : this.hits / total;
	}

	private removeInternal(node: Node<K, V>) {
		this.removeNode(node);
		this.map.delete(node.key);
		this.nodePool.release(node);
		this.size--;
	}

	private moveToFront(node: Node<K, V>): void {
		const { prev, next } = node;
		if (prev) prev.next = next;
		if (next) next.prev = prev;
		if (node === this.tail) this.tail = prev;

		node.prev = null;
		node.next = this.head;
		if (this.head) this.head.prev = node;
		this.head = node;
	}

	private addToFront(node: Node<K, V>): void {
		node.prev = null;
		node.next = this.head;
		if (this.head) this.head.prev = node;
		this.head = node;
		if (!this.tail) this.tail = node;
	}

	private removeNode(node: Node<K, V>): void {
		const { prev, next } = node;
		if (prev) prev.next = next;
		if (next) next.prev = prev;
		if (node === this.head) this.head = next;
		if (node === this.tail) this.tail = prev;
	}

	private evictLRU(): void {
		if (!this.tail) return;
		this.removeInternal(this.tail);
	}
}
