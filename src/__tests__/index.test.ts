import { describe, expect, it } from "vitest";
import * as exports from "../index";

describe("index.ts exports", () => {
	it("should not change unexpectedly", () => {
		const sortedExports = Object.keys(exports).sort();
		expect(sortedExports).toMatchInlineSnapshot(`
			[
			  "createDefaultTooltip",
			  "extractResources",
			  "hoverResource",
			  "mcpExtension",
			  "resourceCompletion",
			  "resourceTheme",
			  "resourcesField",
			]
		`);
	});
});
