import { makeMonad } from "../core/utils.ts";
import { HKT } from "../core/hkt.ts";

export class Task<A> implements HKT<"Task", A> {
	readonly _URI!: "Task";
	readonly _A!: A;

	constructor(public readonly run: () => Promise<A>) {}

	static of<A>(a: A): Task<A> {
		return new Task(() => Promise.resolve(a));
	}

	map<B>(f: (a: A) => B): Task<B> {
		return new Task(() => this.run().then(f));
	}

	flatMap<B>(f: (a: A) => Task<B>): Task<B> {
		return new Task(() => this.run().then((a) => f(a).run()));
	}
}

export const TaskMonad = makeMonad("Task", Task, Task.of);
