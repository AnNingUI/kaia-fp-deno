// lruCache.worker.ts
import type { MiniLRUCache } from "./miniLRUCache.ts";

export class LRUCacheWorker<K, V> {
	private worker: Worker | null = null;

	constructor(
		private readonly cache: MiniLRUCache<K, V>,
		private interval = 60000
	) {}

	start() {
		if (this.worker) return;

		this.worker = new Worker(
			new URL("./lruCache.worker.impl.ts", import.meta.url)
		);
		this.worker.postMessage({ type: "start", interval: this.interval });

		this.worker.onmessage = (event) => {
			if (event.data.type === "sweep") {
				this.cache.sweepExpired();
			}
		};
	}

	stop() {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
	}

	restart(newInterval?: number) {
		this.stop();
		if (newInterval !== undefined) this.interval = newInterval;
		this.start();
	}
}
