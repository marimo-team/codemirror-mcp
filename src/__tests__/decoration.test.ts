import { EditorState, Extension } from "@codemirror/state";
import type { RangeSet } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resourceDecorations } from "../resources/decoration.js";
import type { Resource } from "../resources/resource.js";
import { mcpOptionsField, resourcesField, updateResources } from "../state.js";
import { invariant } from "../utils.js";

// Helper function to count decorations
function countDecorations(decos: RangeSet<Decoration>): number {
	let count = 0;
	decos.between(0, Number.POSITIVE_INFINITY, () => {
		count++;
	});
	return count;
}

describe("resourceDecorations", () => {
	let view: EditorView;
	const sampleResources: Resource[] = [
		{ name: "repo1", uri: "github://repo1", type: "github", data: {} },
		{ name: "repo2", uri: "gitlab://repo2", type: "gitlab", data: {} },
	];

	beforeEach(() => {
		// Create a new editor state and view for each test
		const state = EditorState.create({
			doc: "",
			extensions: [resourcesField, resourceDecorations, mcpOptionsField.init(() => ({}))],
		});
		view = new EditorView({ state });
	});

	afterEach(() => {
		view.destroy();
	});

	test("should create decorations for URIs in text", () => {
		// Set up initial resources
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		// Update document with URIs
		view.dispatch({
			changes: {
				from: 0,
				to: 0,
				insert: "@github://repo1 some text @gitlab://repo2",
			},
		});

		// Get decorations from the plugin
		const decorations = view.plugin(resourceDecorations)?.decorations;
		expect(decorations).toBeDefined();
		invariant(decorations !== undefined, "decorations should be defined");

		// Count decorations
		const count = countDecorations(decorations);
		expect(count).toBe(2);

		// Check positions of decorations
		const positions: number[] = [];
		decorations.between(0, view.state.doc.length, (from, to) => {
			positions.push(from, to);
		});

		expect(positions[0]).toBe(0);
		expect(positions[1]).toBe("@github://repo1".length);
		expect(positions[2]).toBe(view.state.doc.length - "@gitlab://repo2".length);
		expect(positions[3]).toBe(view.state.doc.length);
	});

	test("should update decorations when document changes", () => {
		// Set up initial resources
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		// Add first URI
		view.dispatch({
			changes: {
				from: 0,
				to: 0,
				insert: "@github://repo1",
			},
		});

		let decorations = view.plugin(resourceDecorations)?.decorations;
		invariant(decorations !== undefined, "decorations should be defined");
		expect(countDecorations(decorations)).toBe(1);

		// Add second URI
		view.dispatch({
			changes: {
				from: view.state.doc.length,
				to: view.state.doc.length,
				insert: " @gitlab://repo2",
			},
		});

		decorations = view.plugin(resourceDecorations)?.decorations;
		invariant(decorations !== undefined, "decorations should be defined");
		expect(countDecorations(decorations)).toBe(2);
	});

	test("should update decorations when resources change", () => {
		// Set up initial document
		view.dispatch({
			changes: {
				from: 0,
				to: 0,
				insert: "@github://repo1 @gitlab://repo2 @github://repo3",
			},
		});

		// Add initial resources
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		let decorations = view.plugin(resourceDecorations)?.decorations;
		invariant(decorations !== undefined, "decorations should be defined");
		expect(countDecorations(decorations)).toBe(2); // Only 2 resources are known

		// Add another resource
		const newResources = [
			...sampleResources,
			{
				name: "repo3",
				uri: "github://repo3",
				type: "github",
				data: {},
			},
		];

		view.dispatch({
			effects: updateResources.of(new Map(newResources.map((r) => [r.uri, r]))),
		});

		decorations = view.plugin(resourceDecorations)?.decorations;
		invariant(decorations !== undefined, "decorations should be defined");
		expect(countDecorations(decorations)).toBe(3); // Now all 3 URIs should be decorated
	});

	test("should handle empty document", () => {
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		const decorations = view.plugin(resourceDecorations)?.decorations;
		invariant(decorations !== undefined, "decorations should be defined");
		expect(countDecorations(decorations)).toBe(0);
	});

	test("should handle document without URIs", () => {
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		view.dispatch({
			changes: {
				from: 0,
				to: 0,
				insert: "Just some plain text without any URIs",
			},
		});

		const decorations = view.plugin(resourceDecorations)?.decorations;
		invariant(decorations !== undefined, "decorations should be defined");
		expect(countDecorations(decorations)).toBe(0);
	});

	test("should handle unknown URIs", () => {
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		view.dispatch({
			changes: {
				from: 0,
				to: 0,
				insert: "@unknown://repo some text @github://repo1",
			},
		});

		const decorations = view.plugin(resourceDecorations)?.decorations;
		invariant(decorations !== undefined, "decorations should be defined");
		expect(countDecorations(decorations)).toBe(1); // Only the known URI should be decorated
	});

	test("should handle click events when handler is provided", () => {
		const clickHandler = vi.fn();
		const state = EditorState.create({
			doc: "@github://repo1",
			extensions: [
				resourcesField,
				resourceDecorations,
				mcpOptionsField.init(() => ({ onResourceClick: clickHandler })),
			],
		});
		view = new EditorView({ state });

		// Set up resources
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		// Get the widget element
		const decorations = view.plugin(resourceDecorations)?.decorations;
		expect(decorations).toBeDefined();

		// Find the widget in the DOM
		const widget = view.contentDOM.querySelector(".cm-resource-widget") as HTMLElement;
		expect(widget).toBeDefined();
		expect(widget.style.cursor).toBe("pointer");

		// Simulate click
		widget.click();
		expect(clickHandler).toHaveBeenCalledTimes(1);
		const expectedResource = Array.from(sampleResources.values())[0];
		expect(clickHandler).toHaveBeenCalledWith(expectedResource);
	});

	test("should not add click handler when not provided", () => {
		const state = EditorState.create({
			doc: "@github://repo1",
			extensions: [resourcesField, resourceDecorations],
		});
		view = new EditorView({ state });

		// Set up resources
		view.dispatch({
			effects: updateResources.of(new Map(sampleResources.map((r) => [r.uri, r]))),
		});

		// Get the widget element
		const widget = view.contentDOM.querySelector(".cm-resource-widget") as HTMLElement;
		expect(widget).toBeDefined();
		expect(widget.style.cursor).not.toBe("pointer");
	});
});
