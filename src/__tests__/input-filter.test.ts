import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { resourceInputFilter } from "../resources/input-filter.js";
import { resourcesField } from "../state.js";

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
	});
});
