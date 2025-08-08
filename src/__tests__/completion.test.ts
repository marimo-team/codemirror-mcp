import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { resourceCompletion } from "../resources/completion.js";
import { resourcesField } from "../state.js";
import { Resource } from "../resources/resource.js";

const createMockResource = (uri: string, name?: string): Resource => ({
	uri,
	name: name || uri,
	description: `Test resource: ${uri}`,
	mimeType: "text/plain",
	data: undefined,
});

const createMockView = (doc: string, pos: number) => {
	const state = EditorState.create({
		doc,
		extensions: [resourcesField],
	});

	return new EditorView({
		state,
		parent: document.createElement("div"),
	});
};

const createMockContext = (text: string, pos: number, explicit = false) => {
	const view = createMockView(text, pos);
	
	return {
		state: view.state,
		pos,
		explicit,
		view,
		matchBefore: (regex: RegExp) => {
			const textBefore = text.slice(0, pos);
			const match = textBefore.match(regex);
			if (!match) return null;
			
			return {
				from: pos - match[0].length,
				to: pos,
				text: match[0],
			};
		},
		aborted: false,
		tokenBefore: (types: any) => null,
		prefix: (text: string, from: number) => text.slice(from, pos),
	};
};

describe("resourceCompletion", () => {
	describe("basic functionality", () => {
		it("should return null when no @ character is present", async () => {
			const getResources = vi.fn().mockResolvedValue([]);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("hello world", 11);
			const result = await completion(context);
			
			expect(result).toBeNull();
			expect(getResources).not.toHaveBeenCalled();
		});

		it("should return null when @ is at cursor position and not explicit", async () => {
			const getResources = vi.fn().mockResolvedValue([]);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("hello @", 7, false);
			const result = await completion(context);
			
			expect(result).toBeNull();
		});

		it("should return completions when @ is at cursor position and explicit", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("hello @", 7, true);
			const result = await completion(context);
			
			expect(result).not.toBeNull();
			expect(result?.options).toHaveLength(1);
			expect(result?.options[0].label).toBe("@file.txt");
		});

		it("should return completions when typing after @", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("hello @fi", 9);
			const result = await completion(context);
			
			expect(result).not.toBeNull();
			expect(result?.options).toHaveLength(1);
			expect(result?.from).toBe(6); // Start of @fi
		});

		it("should return null when no resources are available", async () => {
			const getResources = vi.fn().mockResolvedValue([]);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("hello @file", 11);
			const result = await completion(context);
			
			expect(result).toBeNull();
		});
	});

	describe("completion options", () => {
		it("should create completion options with correct properties", async () => {
			const resources = [
				createMockResource("file.txt", "My File"),
				createMockResource("doc.md", "Documentation"),
			];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@", 1, true);
			const result = await completion(context);
			
			expect(result?.options).toHaveLength(2);
			
			const option1 = result?.options[0];
			expect(option1?.label).toBe("@My File");
			expect(option1?.displayLabel).toBe("My File");
			expect(option1?.detail).toBe("file.txt");
			expect(option1?.info).toBe("Test resource: file.txt");
			expect(option1?.type).toBe("constant");
			expect(option1?.boost).toBe(100);
		});

		it("should handle resources without description", async () => {
			const resource: Resource = {
				uri: "file.txt",
				name: "file.txt",
				description: undefined,
				mimeType: "text/plain",
				data: undefined,
			};
			const getResources = vi.fn().mockResolvedValue([resource]);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@", 1, true);
			const result = await completion(context);
			
			const option = result?.options[0];
			expect(option?.info).toBeUndefined();
			expect(option?.boost).toBe(0);
		});

		it("should handle resources without mimeType", async () => {
			const resource: Resource = {
				uri: "file.txt",
				name: "file.txt",
				description: "A file",
				mimeType: undefined,
				data: undefined,
			};
			const getResources = vi.fn().mockResolvedValue([resource]);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@", 1, true);
			const result = await completion(context);
			
			const option = result?.options[0];
			expect(option?.type).toBe("variable");
		});

		it("should use custom formatter when provided", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const formatResource = vi.fn().mockReturnValue({
				label: "Custom Label",
				type: "custom",
				boost: 999,
			});
			const completion = resourceCompletion(getResources, formatResource);
			
			const context = createMockContext("@", 1, true);
			const result = await completion(context);
			
			const option = result?.options[0];
			expect(option?.label).toBe("Custom Label");
			expect(option?.type).toBe("custom");
			expect(option?.boost).toBe(999);
			expect(formatResource).toHaveBeenCalledWith(resources[0]);
		});
	});

	describe("apply functionality", () => {
		it("should insert resource URI with space when applied", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@fi", 3);
			const result = await completion(context);
			
			const option = result?.options[0];
			expect(option?.apply).toBeDefined();

			// Mock the apply function
			const mockView = {
				dispatch: vi.fn(),
			};

			if (option?.apply && typeof option.apply === "function") {
				option.apply(mockView as any, option, 0, 3);
				
				expect(mockView.dispatch).toHaveBeenCalledWith({
					changes: { from: 0, to: 3, insert: "@file.txt " },
				});
			}
		});
	});

	describe("state updates", () => {
		it("should dispatch updateResources effect when view is available", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const view = createMockView("@", 1);
			const dispatchSpy = vi.spyOn(view, "dispatch");
			
			const context = {
				...createMockContext("@", 1, true),
				view,
			};
			
			await completion(context);
			
			expect(dispatchSpy).toHaveBeenCalledWith({
				effects: expect.anything(),
			});
		});

		it("should not dispatch when view is not available", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = {
				...createMockContext("@", 1, true),
				view: undefined,
			};
			
			const result = await completion(context);
			
			// Should still return completions even without view
			expect(result?.options).toHaveLength(1);
		});
	});

	describe("pattern matching", () => {
		it("should match @ at start of word", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@file", 5);
			const result = await completion(context);
			
			expect(result).not.toBeNull();
			expect(result?.from).toBe(0);
		});

		it("should match @ in middle of text", async () => {
			const resources = [createMockResource("file.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("hello @file", 11);
			const result = await completion(context);
			
			expect(result).not.toBeNull();
			expect(result?.from).toBe(6);
		});

		it("should match @ with partial word characters", async () => {
			const resources = [createMockResource("file123.txt")];
			const getResources = vi.fn().mockResolvedValue(resources);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@file123", 8);
			const result = await completion(context);
			
			expect(result).not.toBeNull();
		});

		it("should not match @ followed by non-word characters", async () => {
			const getResources = vi.fn().mockResolvedValue([]);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@-file", 6);
			const result = await completion(context);
			
			expect(result).toBeNull();
		});
	});

	describe("error handling", () => {
		it("should handle getResources errors gracefully", async () => {
			const getResources = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@file", 5);
			
			await expect(completion(context)).rejects.toThrow("Failed to fetch");
		});

		it("should handle malformed resources", async () => {
			const malformedResource = { uri: "test" } as Resource;
			const getResources = vi.fn().mockResolvedValue([malformedResource]);
			const completion = resourceCompletion(getResources);
			
			const context = createMockContext("@", 1, true);
			const result = await completion(context);
			
			// Should handle gracefully and still create completion
			expect(result?.options).toHaveLength(1);
			expect(result?.options[0].label).toBe("@undefined"); // name is undefined
		});
	});
});