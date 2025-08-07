import { describe, expect, test } from "vitest";
import { createDefaultTooltip, findResourceAtPosition } from "../resources/hover.js";
import type { Resource } from "../resources/resource.js";
import { invariant } from "../utils.js";

describe("hover", () => {
	const sampleResources = new Map<string, Resource>([
		[
			"github://repo1",
			{
				name: "repo1",
				uri: "github://repo1",
				type: "github",
				description: "A sample repository",
				mimeType: "application/x-git",
				data: {},
			},
		],
		[
			"gitlab://repo2",
			{
				name: "repo2",
				uri: "gitlab://repo2",
				type: "gitlab",
				data: {},
			},
		],
	]);

	describe("findResourceAtPosition", () => {
		test("should find resource at cursor position", () => {
			const text = "@github://repo1 some text @gitlab://repo2";
			const result = findResourceAtPosition(text, 5, sampleResources);

			expect(result).toBeDefined();
			expect(result?.resource).toEqual(sampleResources.get("github://repo1"));
			expect(result?.start).toBe(0);
			expect(result?.end).toBe("@github://repo1".length);
		});

		test("should handle cursor at start of resource", () => {
			const text = "text @github://repo1";
			const pos = 5; // At the @
			const result = findResourceAtPosition(text, pos, sampleResources);

			expect(result).toBeDefined();
			expect(result?.resource).toEqual(sampleResources.get("github://repo1"));
		});

		test("should handle cursor at end of resource", () => {
			const text = "@github://repo1 text";
			const pos = "@github://repo1".length;
			const result = findResourceAtPosition(text, pos, sampleResources);

			expect(result).toBeDefined();
			expect(result?.resource).toEqual(sampleResources.get("github://repo1"));
		});

		test("should return null for position not on resource", () => {
			const text = "@github://repo1 some text @gitlab://repo2";
			const result = findResourceAtPosition(text, text.indexOf("some"), sampleResources);

			expect(result).toBeNull();
		});

		test("should return null for unknown resource", () => {
			const text = "@unknown://repo some text";
			const result = findResourceAtPosition(text, 5, sampleResources);

			expect(result).toBeNull();
		});

		test.skip("should handle line offset", () => {
			const text = "@github://repo1";
			const lineStart = 100;
			const result = findResourceAtPosition(text, 5, sampleResources, lineStart);

			expect(result).toBeDefined();
			expect(result?.start).toBe(lineStart);
			expect(result?.end).toBe(lineStart + "@github://repo1".length);
		});
	});

	describe("createTooltip", () => {
		test("should create tooltip with resource info", () => {
			const resource = sampleResources.get("github://repo1");
			invariant(resource !== undefined, "Resource not found");
			const tooltip = createDefaultTooltip(resource);

			expect(tooltip.dom).toBeDefined();
			expect(tooltip.dom.className).toBe("cm-tooltip-cursor");

			const title = tooltip.dom.querySelector(".cm-tooltip-cursor-title");
			expect(title).toBeDefined();
			expect(title?.textContent).toBe(`${resource.name} (${resource.uri})`);

			const description = tooltip.dom.querySelector(".cm-tooltip-cursor-description");
			expect(description).toBeDefined();
			expect(description?.textContent).toBe(resource.description);

			const mimeType = tooltip.dom.querySelector(".cm-tooltip-cursor-mimetype");
			expect(mimeType).toBeDefined();
			expect(mimeType?.textContent).toBe(resource.mimeType);
		});

		test("should handle missing optional fields", () => {
			const resource = sampleResources.get("gitlab://repo2");
			invariant(resource !== undefined, "Resource not found");
			const tooltip = createDefaultTooltip(resource);

			const title = tooltip.dom.querySelector(".cm-tooltip-cursor-title");
			expect(title).toBeDefined();
			expect(title?.textContent).toBe(`${resource.name} (${resource.uri})`);

			const description = tooltip.dom.querySelector(".cm-tooltip-cursor-description");
			expect(description).toBeNull();

			const mimeType = tooltip.dom.querySelector(".cm-tooltip-cursor-mimetype");
			expect(mimeType).toBeNull();
		});

		test("should handle different resource types with all fields", () => {
			const resources: Resource[] = [
				{
					name: "repo1",
					uri: "github://repo1",
					type: "github",
					description: "A GitHub repository",
					mimeType: "application/x-git",
					data: {},
				},
				{
					name: "ticket1",
					uri: "jira://ticket1",
					type: "jira",
					description: "A Jira ticket",
					mimeType: "application/json",
					data: {},
				},
				{
					name: "page1",
					uri: "notion://page1",
					type: "notion",
					description: "A Notion page",
					mimeType: "text/html",
					data: {},
				},
			];

			for (const resource of resources) {
				const tooltip = createDefaultTooltip(resource);
				const title = tooltip.dom.querySelector(".cm-tooltip-cursor-title");
				const description = tooltip.dom.querySelector(".cm-tooltip-cursor-description");
				const mimeType = tooltip.dom.querySelector(".cm-tooltip-cursor-mimetype");

				expect(title?.textContent).toBe(`${resource.name} (${resource.uri})`);
				expect(description?.textContent).toBe(resource.description);
				expect(mimeType?.textContent).toBe(resource.mimeType);
			}
		});
	});
});
