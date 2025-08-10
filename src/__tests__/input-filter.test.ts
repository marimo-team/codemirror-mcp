import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { resourceInputFilter } from "../resources/input-filter.js";
import { resourcesField, updateResources } from "../state.js";

// Helper to create a state with resources
function createStateWithResources(doc: string, resourceUris: string[] = []) {
	const state = EditorState.create({
		doc,
		extensions: [resourcesField, resourceInputFilter],
	});

	if (resourceUris.length === 0) return state;

	// Add resources to the state
	const resourceMap = new Map();
	for (const uri of resourceUris) {
		resourceMap.set(uri, {
			type: "test",
			uri,
			name: uri,
			description: `Test resource ${uri}`,
			mimeType: "text/plain",
			data: null,
		});
	}

	return state.update({
		effects: [updateResources.of(resourceMap)],
	}).state;
}

describe("resourceInputFilter", () => {
	describe("filter creation and basic behavior", () => {
		it("should create a transaction filter", () => {
			expect(resourceInputFilter).toBeDefined();
			expect(typeof resourceInputFilter).toBe("object");
		});
	});

	describe("basic transaction filtering", () => {
		it("should handle basic text insertion", () => {
			const state = EditorState.create({
				doc: "hello world",
				extensions: [resourcesField, resourceInputFilter],
			});

			const tr = state.update({
				changes: { from: 5, to: 5, insert: " there" },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			expect(tr.newDoc.toString()).toBe("hello there world");
		});

		it("should preserve document content for non-input transactions", () => {
			const state = EditorState.create({
				doc: "test content",
				extensions: [resourcesField, resourceInputFilter],
			});

			const tr = state.update({
				changes: { from: 0, to: 4, insert: "new" },
			});

			expect(tr.newDoc.toString()).toBe("new content");
		});

		it("should handle empty documents", () => {
			const state = EditorState.create({
				doc: "",
				extensions: [resourcesField, resourceInputFilter],
			});

			const tr = state.update({
				changes: { from: 0, to: 0, insert: "test" },
			});

			expect(tr.newDoc.toString()).toBe("test");
		});

		it("should handle cursor-only changes", () => {
			const state = EditorState.create({
				doc: "hello world",
				extensions: [resourcesField, resourceInputFilter],
			});

			const tr = state.update({
				selection: { anchor: 5, head: 5 },
			});

			expect(tr.newDoc.toString()).toBe("hello world");
			expect(tr.selection?.main.anchor).toBe(5);
		});
	});

	describe("resource deletion", () => {
		it("should delete entire resource when backspacing at end", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);

			// First set the cursor position to the end of the resource (position 20)
			const stateWithCursor = state.update({
				selection: { anchor: 20, head: 20 },
			}).state;

			const tr = stateWithCursor.update({
				changes: { from: 20, to: 20, insert: "" },
				annotations: [Transaction.userEvent.of("delete.backward")],
			});

			// Check that the resource was deleted
			expect(tr.newDoc.toString()).toBe("Check  here");
			expect(tr.selection?.main.anchor).toBe(6);
		});

		it("should delete entire resource when deleting forward at start", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);

			// First set the cursor position to the start of the resource
			const stateWithCursor = state.update({
				selection: { anchor: 6, head: 6 },
			}).state;

			const tr = stateWithCursor.update({
				changes: { from: 6, to: 6, insert: "" },
				annotations: [Transaction.userEvent.of("delete.forward")],
			});

			// Check that the resource was deleted
			expect(tr.newDoc.toString()).toBe("Check  here");
			expect(tr.selection?.main.anchor).toBe(6);
		});

		it("should not delete resource if it doesn't exist in resourcesField", () => {
			const state = createStateWithResources("Check @github://nonexistent here", []);

			// First set the cursor position to the end of the fake resource
			const stateWithCursor = state.update({
				selection: { anchor: 26, head: 26 },
			}).state;

			const tr = stateWithCursor.update({
				changes: { from: 26, to: 26, insert: "" },
				annotations: [Transaction.userEvent.of("delete.backward")],
			});

			// The filter is automatically applied, but should not modify the transaction
			// since the resource doesn't exist in the resourcesField
			expect(tr.newDoc.toString()).toBe("Check @github://nonexistent here");
		});

		it("should not delete if cursor is not at resource boundary", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);

			// First set the cursor position inside the resource (not at boundary)
			const stateWithCursor = state.update({
				selection: { anchor: 10, head: 10 },
			}).state;

			const tr = stateWithCursor.update({
				changes: { from: 10, to: 10, insert: "" },
				annotations: [Transaction.userEvent.of("delete.backward")],
			});

			// The filter is automatically applied, but should not modify the transaction
			// since the cursor is not at a resource boundary
			expect(tr.newDoc.toString()).toBe("Check @github://repo here");
		});
	});

	describe.skip("cursor movement", () => {
		it("should jump to start of resource when moving left from inside", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);
			// Set initial cursor position inside the resource
			const stateWithCursor = state.update({
				selection: { anchor: 15, head: 15 },
			}).state;

			const tr = stateWithCursor.update({
				selection: { anchor: 10, head: 10 },
			});

			// The filter should jump to the start of the resource
			expect(tr.selection?.main.anchor).toBe(6);
		});

		it("should jump to end of resource when moving right from inside", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);
			// Set initial cursor position inside the resource
			const stateWithCursor = state.update({
				selection: { anchor: 10, head: 10 },
			}).state;

			const tr = stateWithCursor.update({
				selection: { anchor: 15, head: 15 },
			});

			// The filter should jump to the end of the resource
			expect(tr.selection?.main.anchor).toBe(18);
		});

		it("should jump to resource boundaries when moving left", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);
			// Set initial cursor position at end of resource
			const stateWithCursor = state.update({
				selection: { anchor: 18, head: 18 },
			}).state;

			const tr = stateWithCursor.update({
				selection: { anchor: 6, head: 6 },
			});

			// The filter should keep the cursor at the resource boundary
			expect(tr.selection?.main.anchor).toBe(6);
		});

		it("should jump to resource boundaries when moving right", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);
			// Set initial cursor position before resource
			const stateWithCursor = state.update({
				selection: { anchor: 5, head: 5 },
			}).state;

			const tr = stateWithCursor.update({
				selection: { anchor: 18, head: 18 },
			});

			// The filter should jump to the start of the resource first
			expect(tr.selection?.main.anchor).toBe(6);
		});

		it("should not interfere with cursor movement on input events", () => {
			const state = createStateWithResources("Check @github://repo here", ["github://repo"]);

			const tr = state.update({
				changes: { from: 10, to: 10, insert: "x" },
				selection: { anchor: 11, head: 11 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// For input events, the filter should not modify cursor movement
			expect(tr.selection?.main.anchor).toBe(11);
		});

		it("should not modify cursor movement if no resource boundaries found", () => {
			const state = createStateWithResources("plain text without resources", []);

			const movementTr = state.update({
				selection: { anchor: 10, head: 10 },
			});

			// Should not modify cursor movement when there are no resources
			expect(movementTr.selection?.main.anchor).toBe(10);
		});
	});

	describe.skip("text insertion with spacing", () => {
		it("should add space before resource when inserting directly before", () => {
			const state = createStateWithResources("text@github://repo", ["github://repo"]);

			const tr = state.update({
				changes: { from: 4, to: 4, insert: "new" },
				selection: { anchor: 4, head: 4 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// The filter should automatically add a space before the resource
			expect(tr.newDoc.toString()).toBe("text new@github://repo");
			expect(tr.selection?.main.anchor).toBe(8);
		});

		it("should add space after resource when inserting directly after", () => {
			const state = createStateWithResources("@github://repotext", ["github://repo"]);

			const tr = state.update({
				changes: { from: 13, to: 13, insert: "new" },
				selection: { anchor: 13, head: 13 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// The filter should automatically add a space after the resource
			expect(tr.newDoc.toString()).toBe("@github://repo newtext");
			expect(tr.selection?.main.anchor).toBe(17);
		});

		it("should not add spaces if there's already whitespace", () => {
			const state = createStateWithResources("text @github://repo here", ["github://repo"]);

			const tr = state.update({
				changes: { from: 5, to: 5, insert: "new" },
				selection: { anchor: 5, head: 5 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should not add extra spaces when whitespace already exists
			expect(tr.newDoc.toString()).toBe("text new@github://repo here");
		});

		it("should not add spaces when inserting whitespace", () => {
			const state = createStateWithResources("text@github://repo", ["github://repo"]);

			const tr = state.update({
				changes: { from: 4, to: 4, insert: " " },
				selection: { anchor: 4, head: 4 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should not add extra spaces when inserting whitespace
			expect(tr.newDoc.toString()).toBe("text @github://repo");
		});

		it("should handle insertion at beginning of document", () => {
			const state = createStateWithResources("@github://repo", ["github://repo"]);

			const tr = state.update({
				changes: { from: 0, to: 0, insert: "start" },
				selection: { anchor: 0, head: 0 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should add space between text and resource at document beginning
			expect(tr.newDoc.toString()).toBe("start @github://repo");
			expect(tr.selection?.main.anchor).toBe(6);
		});

		it("should handle insertion at end of document", () => {
			const state = createStateWithResources("@github://repo", ["github://repo"]);

			const tr = state.update({
				changes: { from: 14, to: 14, insert: "end" },
				selection: { anchor: 14, head: 14 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should add space between resource and text at document end
			expect(tr.newDoc.toString()).toBe("@github://repo end");
			expect(tr.selection?.main.anchor).toBe(18);
		});

		it("should handle multiple resources on same line", () => {
			const state = createStateWithResources("@github://repo1@gitlab://repo2", [
				"github://repo1",
				"gitlab://repo2",
			]);

			const tr = state.update({
				changes: { from: 15, to: 15, insert: "text" },
				selection: { anchor: 15, head: 15 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should add spaces around text inserted between resources
			expect(tr.newDoc.toString()).toBe("@github://repo1 text @gitlab://repo2");
			expect(tr.selection?.main.anchor).toBe(21);
		});

		it("should not add spaces for resources that don't exist in resourcesField", () => {
			const state = createStateWithResources("text@nonexistent://repo", []);

			const tr = state.update({
				changes: { from: 4, to: 4, insert: "new" },
				selection: { anchor: 4, head: 4 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should not add spaces for non-existent resources
			expect(tr.newDoc.toString()).toBe("textnew@nonexistent://repo");
		});
	});

	describe("edge cases", () => {
		it("should handle multiple simultaneous changes", () => {
			const state = EditorState.create({
				doc: "hello world",
				extensions: [resourcesField, resourceInputFilter],
			});

			const tr = state.update({
				changes: [
					{ from: 0, to: 5, insert: "hi" },
					{ from: 6, to: 11, insert: "there" },
				],
			});

			expect(tr.newDoc.toString()).toBe("hi there");
		});

		it("should preserve selection state", () => {
			const state = EditorState.create({
				doc: "hello world",
				extensions: [resourcesField, resourceInputFilter],
				selection: { anchor: 0, head: 5 },
			});

			const tr = state.update({
				changes: { from: 11, to: 11, insert: "!" },
			});

			expect(tr.newDoc.toString()).toBe("hello world!");
		});

		it("should handle large documents", () => {
			const largeDoc = "a".repeat(10000);
			const state = EditorState.create({
				doc: largeDoc,
				extensions: [resourcesField, resourceInputFilter],
			});

			const tr = state.update({
				changes: { from: 5000, to: 5000, insert: "test" },
			});

			expect(tr.newDoc.length).toBe(10004);
		});

		it("should handle transactions with no user event", () => {
			const state = createStateWithResources("@github://repo", ["github://repo"]);

			const tr = state.update({
				changes: { from: 0, to: 0, insert: "test" },
			});

			// Should not modify transactions without user events
			expect(tr.newDoc.toString()).toBe("test@github://repo");
		});

		it("should handle transactions with non-empty selection", () => {
			const state = createStateWithResources("@github://repo", ["github://repo"]);

			const tr = state.update({
				changes: { from: 0, to: 5, insert: "new" },
				selection: { anchor: 0, head: 5 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should not modify transactions with non-empty selections
			expect(tr.newDoc.toString()).toBe("newub://repo");
		});

		it("should handle empty change sets", () => {
			const state = createStateWithResources("@github://repo", ["github://repo"]);

			const tr = state.update({
				selection: { anchor: 5, head: 5 },
				annotations: [Transaction.userEvent.of("input.type")],
			});

			// Should not modify transactions with empty change sets
			expect(tr.newDoc.toString()).toBe("@github://repo");
			expect(tr.selection?.main.anchor).toBe(5);
		});
	});
});
