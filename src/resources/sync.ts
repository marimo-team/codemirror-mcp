import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { resourcesField, updateResources } from "../state.js";
import { matchAllURIs } from "../utils.js";
import type { Resource } from "./resource.js";

type GetResources = () => Resource[] | Promise<Resource[]>;
/**
 * Optional targeted resolver. When provided, only the unresolved URIs are
 * fetched instead of the whole catalog — cheaper for network-backed providers.
 */
type ResolveResources = (uris: string[]) => Resource[] | Promise<Resource[]>;
type SyncLogger = Pick<Console, "error">;

const DEFAULT_DEBOUNCE_MS = 150;

export interface ResourceSyncOptions {
	/** Debounce window (ms) for coalescing rapid document changes. */
	debounceMs?: number;
	logger?: SyncLogger;
	/**
	 * Resolve only the given unresolved URIs. Falls back to filtering the full
	 * `getResources()` result when omitted.
	 */
	resolve?: ResolveResources;
}

/** Collect unique @-mention URIs in `text` that are missing from `resources`. */
function getUnresolvedUris(text: string, resources: Map<string, Resource>): string[] {
	const unresolved = new Set<string>();
	for (const match of matchAllURIs(text)) {
		const uri = match[0].slice(1);
		if (!resources.has(uri)) {
			unresolved.add(uri);
		}
	}
	return [...unresolved];
}

/** Stable key for an unresolved set, so we can skip re-work when it is unchanged. */
function unresolvedKey(uris: string[]): string {
	return [...uris].sort().join("\n");
}

function keyIncludesAll(key: string, uris: string[]): boolean {
	if (key === "") {
		return false;
	}
	const previous = new Set(key.split("\n"));
	return uris.every((uri) => previous.has(uri));
}

function changedLineText(update: ViewUpdate): { before: string; after: string } {
	const before: string[] = [];
	const after: string[] = [];
	update.changes.iterChanges((fromA, toA, fromB, toB) => {
		const oldStartLine = update.startState.doc.lineAt(fromA);
		const oldEndLine = update.startState.doc.lineAt(
			toA === fromA ? fromA : Math.max(fromA, toA - 1),
		);
		before.push(update.startState.doc.sliceString(oldStartLine.from, oldEndLine.to));

		const newStartLine = update.state.doc.lineAt(fromB);
		const newEndLine = update.state.doc.lineAt(toB === fromB ? fromB : Math.max(fromB, toB - 1));
		after.push(update.state.doc.sliceString(newStartLine.from, newEndLine.to));
	});
	return { before: before.join("\n"), after: after.join("\n") };
}

function createResourceSyncPlugin(getResources: GetResources, options: ResourceSyncOptions) {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const { logger, resolve } = options;

	return class ResourceSyncPlugin {
		private timer: ReturnType<typeof setTimeout> | undefined;
		private running = false;
		// Set when work arrives mid-fetch, so we re-check afterwards instead of
		// dropping a newly typed/inserted URI.
		private rerun = false;
		// Last unresolved set we acted on; used to avoid redundant fetches (e.g. a
		// permanently-unresolvable URI must not re-fetch on every keystroke).
		private lastKey = "";
		private destroyed = false;

		constructor(readonly view: EditorView) {
			// Covers documents that already contain URIs at construction time.
			this.maybeSchedule(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged) {
				const changedText = changedLineText(update);
				if (changedText.before.includes("://")) {
					this.maybeSchedule(update.view);
					return;
				}
				this.maybeSchedule(update.view, changedText.after);
			}
		}

		destroy() {
			this.destroyed = true;
			if (this.timer !== undefined) {
				clearTimeout(this.timer);
			}
		}

		private maybeSchedule(view: EditorView, changedText?: string) {
			const text = changedText ?? view.state.doc.toString();
			// Cheap pre-filter: a URI always contains "://".
			if (!text.includes("://")) {
				if (changedText === undefined) {
					this.lastKey = "";
				}
				return;
			}

			const unresolved = getUnresolvedUris(text, view.state.field(resourcesField));
			const key = unresolvedKey(unresolved);
			if (key === "") {
				if (changedText === undefined) {
					this.lastKey = "";
				}
				return;
			}
			if (keyIncludesAll(this.lastKey, unresolved)) {
				return;
			}

			if (this.timer !== undefined) {
				clearTimeout(this.timer);
			}
			this.timer = setTimeout(() => {
				this.timer = undefined;
				void this.run(view);
			}, debounceMs);
		}

		private async run(view: EditorView) {
			if (this.destroyed) {
				return;
			}
			if (this.running) {
				this.rerun = true;
				return;
			}

			this.running = true;
			try {
				do {
					this.rerun = false;

					const unresolved = getUnresolvedUris(
						view.state.doc.toString(),
						view.state.field(resourcesField),
					);
					if (unresolved.length === 0) {
						this.lastKey = "";
						break;
					}

					this.lastKey = unresolvedKey(unresolved);
					const fresh = resolve ? await resolve(unresolved) : await getResources();
					if (this.destroyed) {
						return;
					}

					const wanted = new Set(unresolved);
					const resolved = fresh.filter((resource) => wanted.has(resource.uri));
					if (resolved.length === 0) {
						// Nothing resolvable right now; stop retrying this set.
						break;
					}

					view.dispatch({
						effects: updateResources.of(
							new Map(resolved.map((resource) => [resource.uri, resource])),
						),
					});
					this.rerun = true;
				} while (this.rerun);
			} catch (error) {
				this.lastKey = "";
				logger?.error("Failed to sync resources:", error);
			} finally {
				this.running = false;
			}
		}
	};
}

/**
 * Keeps `resourcesField` in sync with `@`-mention URIs in the document.
 *
 * Runs once at editor creation (covering programmatic prefills and restored
 * documents) and again — debounced — whenever the document changes. Work is
 * gated on the set of unresolved URIs actually changing, so steady-state typing
 * costs only a changed-line scan; `getResources`/`resolve` runs only when a
 * new unresolved URI appears.
 */
export function resourceSync(
	getResources: GetResources,
	options: ResourceSyncOptions = {},
): Extension {
	return ViewPlugin.fromClass(createResourceSyncPlugin(getResources, options));
}
