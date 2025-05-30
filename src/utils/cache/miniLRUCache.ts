// MiniLRUCache.ts
import { type Node, NodePool } from "./NodeManager.ts";
import { LRUCacheWorker } from "./lruCache.worker.ts";

interface CacheOptions {
	ttl?: number; // 毫秒，0 表示不启用
	autoSweep?: boolean; // 是否自动定时清理
	sweepInterval?: number; // 自动清理间隔，默认60000ms
}

export class MiniLRUCache<K, V> {
	private map = new Map<K, Node<K, V>>();
	private head: Node<K, V> | null = null;
	private tail: Node<K, V> | null = null;
	private size = 0;

	private hits = 0;
	private misses = 0;

	private readonly nodePool = new NodePool<K, V>();
	private readonly ttl: number;
	private readonly sweepWorker?: LRUCacheWorker<K, V>;

	constructor(private readonly max: number, options: CacheOptions = {}) {
		this.ttl = options.ttl ?? 0;

		if (this.ttl > 0 && options.autoSweep) {
			this.sweepWorker = new LRUCacheWorker(
				this,
				options.sweepInterval ?? 60000
			);
			this.sweepWorker.start();
		}
	}

	get(key: K, now = Date.now()): V | undefined {
		const node = this.map.get(key);
		if (!node) {
			this.misses++;
			return undefined;
		}

		if (this.ttl > 0 && now - node.createdAt > this.ttl) {
			this.removeInternal(node);
			this.misses++;
			return undefined;
		}

		this.hits++;
		if (node !== this.head) this.moveToFront(node);
		return node.value;
	}

	set(key: K, value: V, now = Date.now()): void {
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

	has(key: K, now = Date.now()): boolean {
		const node = this.map.get(key);
		if (!node) return false;

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

		if (this.sweepWorker) {
			this.sweepWorker.stop(); // 停止 Web Worker
		}
	}

	get hitRate(): number {
		const total = this.hits + this.misses;
		return total === 0 ? 0 : this.hits / total;
	}

	/** 主动清理过期节点 */
	sweepExpired(now = Date.now()): void {
		if (this.ttl <= 0) return;

		let node = this.tail;
		while (node) {
			const prev = node.prev;
			if (now - node.createdAt > this.ttl) {
				this.removeInternal(node);
			} else {
				break; // 因为是 LRU，越往头部越新，遇到第一个没过期就停止
			}
			node = prev;
		}
	}

	private removeInternal(node: Node<K, V>) {
		this.removeNode(node);
		this.map.delete(node.key);
		this.nodePool.release(node);
		this.size--;
	}

	private moveToFront(node: Node<K, V>): void {
		if (node === this.head) return;

		// 断开 node 链接
		this.removeNode(node);

		// 插入到头部
		node.prev = null;
		node.next = this.head;
		if (this.head) this.head.prev = node;
		this.head = node;

		if (!this.tail) this.tail = node;
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
		node.prev = null;
		node.next = null;
	}

	private evictLRU(): void {
		if (!this.tail) return;
		this.removeInternal(this.tail);
	}
}
