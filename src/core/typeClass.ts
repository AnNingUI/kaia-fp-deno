// deno-lint-ignore-file
import type { Kind, URItoKind } from "../core/index.ts";

export interface Functor<F extends keyof URItoKind<any>> {
	map<A, B>(fa: Kind<F, A>, f: (a: A) => B): Kind<F, B>;
}

export interface Applicative<F extends keyof URItoKind<any>>
	extends Functor<F> {
	of<A>(a: A): Kind<F, A>;
	ap<A, B>(fab: Kind<F, (a: A) => B>, fa: Kind<F, A>): Kind<F, B>;
}

export interface Monad<F extends keyof URItoKind<any>> extends Applicative<F> {
	flatMap<A, B>(fa: Kind<F, A>, f: (a: A) => Kind<F, B>): Kind<F, B>;
}

export interface Foldable<F extends keyof URItoKind<any>> {
	fold<A, B>(fa: Kind<F, A>, init: B, f: (acc: B, a: A) => B): B;
}

export interface Traversable<F extends keyof URItoKind<any>>
	extends Functor<F>,
		Foldable<F> {
	traverse<G extends keyof URItoKind<any>, A, B>(
		applicative: Applicative<G>,
		f: (a: A) => Kind<G, B>,
		ta: Kind<F, A>
	): Kind<G, Kind<F, B>>;
}
