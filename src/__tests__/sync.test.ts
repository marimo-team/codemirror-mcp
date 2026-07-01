import { EditorState } from "@codemirror/state";
import type { RangeSet } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resourceDecorations } from "../resources/decoration.js";
import type { Resource } from "../resources/resource.js";
import { resourceSync } from "../resources/sync.js";
import { resourcesField } from "../state.js";
import { invariant } from "../utils.js";

function countDecorations(decos: RangeSet<Decoration>): number {
	let count = 0;
	decos.between(0, Number.POSITIVE_INFINITY, (_from, _to, decoration) => {
		// biome-ignore lint/suspicious/noExplicitAny: tests
		if ((decoration as any).widget.resource) {
			count++;
		}
	});
	return count;
}

function expectDecorations(view: EditorView, expected: number) {
	const decorations = view.plugin(resourceDecorations)?.decorations;
	invariant(decorations !== undefined, "decorations should be defined");
	expect(countDecorations(decorations)).toBe(expected);
}

const repo1: Resource = { name: "repo1", uri: "github://repo1", type: "github", data: {} };
const repo2: Resource = { name: "repo2", uri: "gitlab://repo2", type: "gitlab", data: {} };

describe("resourceSync", () => {
	let view: EditorView;

	afterEach(() => {
		view.destroy();
	});

	function mount(doc: string, getResources: () => Resource[] | Promise<Resource[]>) {
		const state = EditorState.create({
			doc,
			extensions: [
				resourcesField,
				resourceDecorations,
				resourceSync(getResources, { debounceMs: 0 }),
			],
		});
		view = new EditorView({ state });
		return view;
	}

	test("resolves URIs present at construction", async () => {
		const getResources = vi.fn(() => [repo1]);
		mount("@github://repo1 hello", getResources);

		await vi.waitFor(() => expectDecorations(view, 1));
		expect(getResources).toHaveBeenCalled();
	});

	test("resolves URIs added after construction (prefill into a live editor)", async () => {
		const getResources = vi.fn(() => [repo1]);
		mount("", getResources);

		// Nothing to do yet.
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(getResources).not.toHaveBeenCalled();

		view.dispatch({ changes: { from: 0, to: 0, insert: "@github://repo1" } });
		await vi.waitFor(() => expectDecorations(view, 1));
	});

	test("does not fetch when all URIs are already known", async () => {
		const getResources = vi.fn(() => [repo1]);
		const state = EditorState.create({
			doc: "@github://repo1",
			extensions: [
				resourcesField.init(() => new Map([[repo1.uri, repo1]])),
				resourceDecorations,
				resourceSync(getResources, { debounceMs: 0 }),
			],
		});
		view = new EditorView({ state });

		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(getResources).not.toHaveBeenCalled();
	});

	test("does not re-fetch for an unchanged unresolved set", async () => {
		const getResources = vi.fn(() => [repo1]);
		mount("@unknown://x", getResources);

		await vi.waitFor(() => expect(getResources).toHaveBeenCalledTimes(1));

		// Typing more text that keeps the same (still unresolvable) URI set must
		// not trigger additional fetches.
		view.dispatch({
			changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " more" },
		});
		view.dispatch({
			changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " text" },
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(getResources).toHaveBeenCalledTimes(1);
		expectDecorations(view, 0);
	});

	test("allows the same unresolved URI to sync again after removal and re-add", async () => {
		const getResources = vi.fn(() => [repo1]);
		mount("@unknown://x", getResources);

		await vi.waitFor(() => expect(getResources).toHaveBeenCalledTimes(1));

		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: "" },
		});
		await new Promise((resolve) => setTimeout(resolve, 10));

		view.dispatch({
			changes: { from: 0, to: 0, insert: "@unknown://x" },
		});

		await vi.waitFor(() => expect(getResources).toHaveBeenCalledTimes(2));
		expectDecorations(view, 0);
	});

	test("does not treat a subset of unresolved URIs as unchanged", async () => {
		const getResources = vi.fn(() => [repo1]);
		mount("@unknown://x @unknown://y", getResources);

		await vi.waitFor(() => expect(getResources).toHaveBeenCalledTimes(1));

		view.dispatch({
			changes: { from: 0, to: "@unknown://x ".length, insert: "" },
		});
		await vi.waitFor(() => expect(getResources).toHaveBeenCalledTimes(2));

		view.dispatch({
			changes: { from: 0, to: 0, insert: "@unknown://x " },
		});

		await vi.waitFor(() => expect(getResources).toHaveBeenCalledTimes(3));
		expectDecorations(view, 0);
	});

	test("clears pending work when the unresolved set returns to the last processed key", async () => {
		vi.useFakeTimers();
		try {
			const getResources = vi.fn(() => [repo1]);
			const state = EditorState.create({
				doc: "@unknown://x",
				extensions: [
					resourcesField,
					resourceDecorations,
					resourceSync(getResources, { debounceMs: 50 }),
				],
			});
			view = new EditorView({ state });

			await vi.advanceTimersByTimeAsync(50);
			expect(getResources).toHaveBeenCalledTimes(1);

			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: "@unknown://y" },
			});
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: "@unknown://x" },
			});

			await vi.advanceTimersByTimeAsync(50);
			expect(getResources).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	test("does not stringify the whole document for plain text edits", async () => {
		const getResources = vi.fn(() => [repo1]);
		const longDoc = Array.from({ length: 1000 }, (_, i) => `plain line ${i}`).join("\n");
		mount(longDoc, getResources);
		await new Promise((resolve) => setTimeout(resolve, 5));

		const textPrototype = Object.getPrototypeOf(view.state.doc) as {
			toString(): string;
		};
		const toStringSpy = vi.spyOn(textPrototype, "toString");

		try {
			view.dispatch({
				changes: {
					from: view.state.doc.length,
					to: view.state.doc.length,
					insert: "\nmore plain text",
				},
			});
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(toStringSpy).not.toHaveBeenCalled();
			expect(getResources).not.toHaveBeenCalled();
		} finally {
			toStringSpy.mockRestore();
		}
	});

	test("does not stringify the whole document for ordinary URL edits", async () => {
		const getResources = vi.fn(() => [repo1]);
		mount("see https://example.com", getResources);
		await new Promise((resolve) => setTimeout(resolve, 5));

		const textPrototype = Object.getPrototypeOf(view.state.doc) as {
			toString(): string;
		};
		const toStringSpy = vi.spyOn(textPrototype, "toString");

		try {
			view.dispatch({
				changes: {
					from: view.state.doc.length,
					to: view.state.doc.length,
					insert: "/docs",
				},
			});
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(toStringSpy).not.toHaveBeenCalled();
			expect(getResources).not.toHaveBeenCalled();
		} finally {
			toStringSpy.mockRestore();
		}
	});

	test("uses the targeted resolve option instead of the full catalog", async () => {
		const getResources = vi.fn(() => [repo1, repo2]);
		const resolve = vi.fn((uris: string[]) => [repo1, repo2].filter((r) => uris.includes(r.uri)));
		const state = EditorState.create({
			doc: "@github://repo1",
			extensions: [
				resourcesField,
				resourceDecorations,
				resourceSync(getResources, { debounceMs: 0, resolve }),
			],
		});
		view = new EditorView({ state });

		await vi.waitFor(() => expectDecorations(view, 1));
		expect(resolve).toHaveBeenCalledWith(["github://repo1"]);
		expect(getResources).not.toHaveBeenCalled();
	});

	test("re-checks unresolved URIs after partial resolution", async () => {
		const getResources = vi.fn(() => [repo1, repo2]);
		const resolve = vi
			.fn<(uris: string[]) => Resource[]>()
			.mockReturnValueOnce([repo1])
			.mockReturnValueOnce([repo2])
			.mockReturnValue([]);
		const state = EditorState.create({
			doc: "@github://repo1 @gitlab://repo2",
			extensions: [
				resourcesField,
				resourceDecorations,
				resourceSync(getResources, { debounceMs: 0, resolve }),
			],
		});
		view = new EditorView({ state });

		await vi.waitFor(() => expectDecorations(view, 2));
		expect(resolve).toHaveBeenNthCalledWith(1, ["github://repo1", "gitlab://repo2"]);
		expect(resolve).toHaveBeenNthCalledWith(2, ["gitlab://repo2"]);
		expect(getResources).not.toHaveBeenCalled();
	});

	test("re-syncs URIs added while a fetch is in flight", async () => {
		const available: Resource[] = [repo1];
		const resolvers: Array<() => void> = [];
		const getResources = vi.fn(
			() =>
				new Promise<Resource[]>((resolve) => {
					const snapshot = [...available];
					resolvers.push(() => resolve(snapshot));
				}),
		);
		mount("@github://repo1", getResources);

		await vi.waitFor(() => expect(resolvers).toHaveLength(1));

		available.push(repo2);
		view.dispatch({
			changes: {
				from: view.state.doc.length,
				to: view.state.doc.length,
				insert: " @gitlab://repo2",
			},
		});

		resolvers[0]();
		await vi.waitFor(() => expect(resolvers.length).toBeGreaterThanOrEqual(2));
		resolvers[resolvers.length - 1]();

		await vi.waitFor(() => expectDecorations(view, 2));
	});

	test("re-checks changed unresolved set when an in-flight fetch resolves empty", async () => {
		let resolveFirst: (() => void) | undefined;
		const getResources = vi
			.fn<() => Promise<Resource[]>>()
			.mockImplementationOnce(
				() =>
					new Promise<Resource[]>((resolve) => {
						resolveFirst = () => resolve([]);
					}),
			)
			.mockResolvedValue([repo1]);
		mount("@unknown://x", getResources);

		await vi.waitFor(() => expect(getResources).toHaveBeenCalledTimes(1));

		view.dispatch({
			changes: {
				from: view.state.doc.length,
				to: view.state.doc.length,
				insert: " @github://repo1",
			},
		});
		resolveFirst?.();

		await vi.waitFor(() => expectDecorations(view, 1));
		expect(getResources).toHaveBeenCalledTimes(3);
	});

	test("logs when resolution throws", async () => {
		const error = new Error("resource fetch failed");
		const logger = { error: vi.fn() };
		const getResources = vi.fn<() => Promise<Resource[]>>().mockRejectedValue(error);
		const state = EditorState.create({
			doc: "@github://repo1",
			extensions: [
				resourcesField,
				resourceDecorations,
				resourceSync(getResources, { debounceMs: 0, logger }),
			],
		});
		view = new EditorView({ state });

		await vi.waitFor(() =>
			expect(logger.error).toHaveBeenCalledWith("Failed to sync resources:", error),
		);
		expectDecorations(view, 0);
	});

	test("retries the same unresolved set after a transient error", async () => {
		const error = new Error("resource fetch failed");
		const logger = { error: vi.fn() };
		const getResources = vi
			.fn<() => Promise<Resource[]>>()
			.mockRejectedValueOnce(error)
			.mockResolvedValue([repo1]);
		const state = EditorState.create({
			doc: "@github://repo1",
			extensions: [
				resourcesField,
				resourceDecorations,
				resourceSync(getResources, { debounceMs: 0, logger }),
			],
		});
		view = new EditorView({ state });

		await vi.waitFor(() =>
			expect(logger.error).toHaveBeenCalledWith("Failed to sync resources:", error),
		);

		view.dispatch({
			changes: { from: view.state.doc.length, to: view.state.doc.length, insert: " " },
		});

		await vi.waitFor(() => expectDecorations(view, 1));
		expect(getResources).toHaveBeenCalledTimes(2);
	});
});
