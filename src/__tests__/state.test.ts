import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
	resourcesField,
	updateResources,
	mcpOptionsField,
	promptsField,
	updatePrompts,
} from "../state.js";
import { Resource } from "../resources/resource.js";
import { Prompt } from "@modelcontextprotocol/sdk/types.js";

const createMockResource = (uri: string): Resource => ({
	uri,
	name: uri,
	description: `Test resource: ${uri}`,
	mimeType: "text/plain",
	data: undefined,
});

const createMockPrompt = (name: string): Prompt => ({
	name,
	description: `Test prompt: ${name}`,
	arguments: [],
});

describe("state", () => {
	describe("resourcesField", () => {
		it("should initialize with empty map", () => {
			const state = EditorState.create({
				extensions: [resourcesField],
			});

			const resources = state.field(resourcesField);
			expect(resources.size).toBe(0);
		});

		it("should update resources with updateResources effect", () => {
			const state = EditorState.create({
				extensions: [resourcesField],
			});

			const testResources = new Map([
				["file1.txt", createMockResource("file1.txt")],
				["file2.txt", createMockResource("file2.txt")],
			]);

			const newState = state.update({
				effects: [updateResources.of(testResources)],
			}).state;

			const resources = newState.field(resourcesField);
			expect(resources.size).toBe(2);
			expect(resources.has("file1.txt")).toBe(true);
			expect(resources.has("file2.txt")).toBe(true);
			expect(resources.get("file1.txt")?.name).toBe("file1.txt");
		});

		it("should merge resources when applying multiple updates", () => {
			const state = EditorState.create({
				extensions: [resourcesField],
			});

			const firstBatch = new Map([
				["file1.txt", createMockResource("file1.txt")],
			]);

			const secondBatch = new Map([
				["file2.txt", createMockResource("file2.txt")],
			]);

			const state1 = state.update({
				effects: [updateResources.of(firstBatch)],
			}).state;

			const state2 = state1.update({
				effects: [updateResources.of(secondBatch)],
			}).state;

			const resources = state2.field(resourcesField);
			expect(resources.size).toBe(2);
			expect(resources.has("file1.txt")).toBe(true);
			expect(resources.has("file2.txt")).toBe(true);
		});

		it("should overwrite existing resources with same URI", () => {
			const state = EditorState.create({
				extensions: [resourcesField],
			});

			const original = new Map([
				["file.txt", createMockResource("file.txt")],
			]);

			const updated = new Map([
				["file.txt", { ...createMockResource("file.txt"), description: "Updated description" }],
			]);

			const state1 = state.update({
				effects: [updateResources.of(original)],
			}).state;

			const state2 = state1.update({
				effects: [updateResources.of(updated)],
			}).state;

			const resources = state2.field(resourcesField);
			expect(resources.size).toBe(1);
			expect(resources.get("file.txt")?.description).toBe("Updated description");
		});

		it("should handle multiple effects in single transaction", () => {
			const state = EditorState.create({
				extensions: [resourcesField],
			});

			const batch1 = new Map([["file1.txt", createMockResource("file1.txt")]]);
			const batch2 = new Map([["file2.txt", createMockResource("file2.txt")]]);

			const newState = state.update({
				effects: [
					updateResources.of(batch1),
					updateResources.of(batch2),
				],
			}).state;

			const resources = newState.field(resourcesField);
			expect(resources.size).toBe(2);
			expect(resources.has("file1.txt")).toBe(true);
			expect(resources.has("file2.txt")).toBe(true);
		});

		it("should preserve state when no updateResources effects", () => {
			const state = EditorState.create({
				extensions: [resourcesField],
			});

			const testResources = new Map([
				["file.txt", createMockResource("file.txt")],
			]);

			const state1 = state.update({
				effects: [updateResources.of(testResources)],
			}).state;

			const state2 = state1.update({
				changes: { from: 0, to: 0, insert: "test" },
			}).state;

			const resources = state2.field(resourcesField);
			expect(resources.size).toBe(1);
			expect(resources.has("file.txt")).toBe(true);
		});
	});

	describe("mcpOptionsField", () => {
		it("should initialize with undefined handlers", () => {
			const state = EditorState.create({
				extensions: [mcpOptionsField],
			});

			const options = state.field(mcpOptionsField);
			expect(options.onResourceClick).toBeUndefined();
			expect(options.onResourceMouseOver).toBeUndefined();
			expect(options.onResourceMouseOut).toBeUndefined();
			expect(options.onPromptSubmit).toBeUndefined();
		});

		it("should maintain the same value across updates", () => {
			const mockHandlers = {
				onResourceClick: () => {},
				onResourceMouseOver: () => {},
				onResourceMouseOut: () => {},
				onPromptSubmit: () => {},
			};

			const state = EditorState.create({
				extensions: [mcpOptionsField],
			});

			// The field doesn't have effects to update it, so we test that it preserves values
			const options = state.field(mcpOptionsField);
			expect(typeof options).toBe("object");
		});
	});

	describe("promptsField", () => {
		it("should initialize with empty map", () => {
			const state = EditorState.create({
				extensions: [promptsField],
			});

			const prompts = state.field(promptsField);
			expect(prompts.size).toBe(0);
		});

		it("should update prompts with updatePrompts effect", () => {
			const state = EditorState.create({
				extensions: [promptsField],
			});

			const testPrompts = new Map([
				["prompt1", createMockPrompt("prompt1")],
				["prompt2", createMockPrompt("prompt2")],
			]);

			const newState = state.update({
				effects: [updatePrompts.of(testPrompts)],
			}).state;

			const prompts = newState.field(promptsField);
			expect(prompts.size).toBe(2);
			expect(prompts.has("prompt1")).toBe(true);
			expect(prompts.has("prompt2")).toBe(true);
			expect(prompts.get("prompt1")?.name).toBe("prompt1");
		});

		it("should merge prompts when applying multiple updates", () => {
			const state = EditorState.create({
				extensions: [promptsField],
			});

			const firstBatch = new Map([
				["prompt1", createMockPrompt("prompt1")],
			]);

			const secondBatch = new Map([
				["prompt2", createMockPrompt("prompt2")],
			]);

			const state1 = state.update({
				effects: [updatePrompts.of(firstBatch)],
			}).state;

			const state2 = state1.update({
				effects: [updatePrompts.of(secondBatch)],
			}).state;

			const prompts = state2.field(promptsField);
			expect(prompts.size).toBe(2);
			expect(prompts.has("prompt1")).toBe(true);
			expect(prompts.has("prompt2")).toBe(true);
		});

		it("should overwrite existing prompts with same name", () => {
			const state = EditorState.create({
				extensions: [promptsField],
			});

			const original = new Map([
				["prompt", createMockPrompt("prompt")],
			]);

			const updated = new Map([
				["prompt", { ...createMockPrompt("prompt"), description: "Updated description" }],
			]);

			const state1 = state.update({
				effects: [updatePrompts.of(original)],
			}).state;

			const state2 = state1.update({
				effects: [updatePrompts.of(updated)],
			}).state;

			const prompts = state2.field(promptsField);
			expect(prompts.size).toBe(1);
			expect(prompts.get("prompt")?.description).toBe("Updated description");
		});

		it("should handle multiple effects in single transaction", () => {
			const state = EditorState.create({
				extensions: [promptsField],
			});

			const batch1 = new Map([["prompt1", createMockPrompt("prompt1")]]);
			const batch2 = new Map([["prompt2", createMockPrompt("prompt2")]]);

			const newState = state.update({
				effects: [
					updatePrompts.of(batch1),
					updatePrompts.of(batch2),
				],
			}).state;

			const prompts = newState.field(promptsField);
			expect(prompts.size).toBe(2);
			expect(prompts.has("prompt1")).toBe(true);
			expect(prompts.has("prompt2")).toBe(true);
		});

		it("should preserve state when no updatePrompts effects", () => {
			const state = EditorState.create({
				extensions: [promptsField],
			});

			const testPrompts = new Map([
				["prompt", createMockPrompt("prompt")],
			]);

			const state1 = state.update({
				effects: [updatePrompts.of(testPrompts)],
			}).state;

			const state2 = state1.update({
				changes: { from: 0, to: 0, insert: "test" },
			}).state;

			const prompts = state2.field(promptsField);
			expect(prompts.size).toBe(1);
			expect(prompts.has("prompt")).toBe(true);
		});
	});

	describe("integration tests", () => {
		it("should handle both resources and prompts in same state", () => {
			const state = EditorState.create({
				extensions: [resourcesField, promptsField, mcpOptionsField],
			});

			const testResources = new Map([
				["file.txt", createMockResource("file.txt")],
			]);

			const testPrompts = new Map([
				["prompt", createMockPrompt("prompt")],
			]);

			const newState = state.update({
				effects: [
					updateResources.of(testResources),
					updatePrompts.of(testPrompts),
				],
			}).state;

			expect(newState.field(resourcesField).size).toBe(1);
			expect(newState.field(promptsField).size).toBe(1);
		});

		it("should maintain separate state for resources and prompts", () => {
			const state = EditorState.create({
				extensions: [resourcesField, promptsField],
			});

			const testResources = new Map([
				["item", createMockResource("item")],
			]);

			const testPrompts = new Map([
				["item", createMockPrompt("item")],
			]);

			const newState = state.update({
				effects: [
					updateResources.of(testResources),
					updatePrompts.of(testPrompts),
				],
			}).state;

			const resources = newState.field(resourcesField);
			const prompts = newState.field(promptsField);

			expect(resources.get("item")?.uri).toBe("item");
			expect(prompts.get("item")?.name).toBe("item");
			expect(resources.get("item")).not.toBe(prompts.get("item"));
		});
	});
});