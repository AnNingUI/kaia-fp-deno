// deno-lint-ignore-file ban-ts-comment
let intervalId: ReturnType<typeof setInterval> | null = null;

// @ts-ignore
self.onmessage = (event: MessageEvent): void => {
	const { type, interval } = event.data;

	if (type === "start") {
		if (intervalId) clearInterval(intervalId);
		intervalId = setInterval(() => {
			// @ts-ignore
			self.postMessage({ type: "sweep" });
		}, interval);
	} else if (type === "stop") {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}
};
