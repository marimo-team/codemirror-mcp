import { describe, expect, test } from "vitest";
import { URI_PATTERN, matchAllURIs } from "../utils";

describe("URI_PATTERN", () => {
	const validURIs = [
		"@github://repo",
		"@slack://channel",
		"@cursor://workspace",
		// Edge cases
		"@github://repo/", // trailing slash
		"@github://repo/sub", // subpath allowed
		"@github://repo?q=1", // query params allowed
		"@github://repo#1", // hash allowed
	];

	const invalidURIs = [
		"", // empty string
		"@", // just @
		"github://repo", // missing @
		"@github:/repo", // missing /
		"@github:///repo", // too many /
		"@git hub://repo", // space in protocol
		"plain text", // plain text
		"@github:repo", // missing //
		"@://repo", // missing protocol
		"@github://", // missing resource
	];

	describe("test()", () => {
		test.each(validURIs)("should match valid URI: %s", (uri) => {
			expect(URI_PATTERN.test(uri)).toBe(true);
			expect(Array.from(matchAllURIs(uri))[0][0]).toBe(uri);
		});

		test.each(invalidURIs)("should not match invalid URI: %s", (uri) => {
			expect(URI_PATTERN.test(uri)).toBe(false);
		});
	});

	describe("matchAll()", () => {
		test("should find all URIs in text", () => {
			const text = `Here are some URIs:
        @github://repo1/file.md and @gitlab://project2/file.md
        Some text in between
        @notion://page3
        More text @teams://channel4/user1`;

			const matches = Array.from(matchAllURIs(text));
			expect(matches).toHaveLength(4);
			expect(matches[0][0]).toBe("@github://repo1/file.md");
			expect(matches[1][0]).toBe("@gitlab://project2/file.md");
			expect(matches[2][0]).toBe("@notion://page3");
			expect(matches[3][0]).toBe("@teams://channel4/user1");
		});

		test("should return empty array for text without URIs", () => {
			const text = "Just some plain text without any URIs";
			const matches = Array.from(matchAllURIs(text));
			expect(matches).toHaveLength(0);
		});

		test("should handle multiple URIs on same line", () => {
			const text = "@github://repo1/file.md @gitlab://repo2/file.md @notion://page3";
			const matches = Array.from(matchAllURIs(text));
			expect(matches).toHaveLength(3);
			expect(matches.map((m) => m[0])).toEqual([
				"@github://repo1/file.md",
				"@gitlab://repo2/file.md",
				"@notion://page3",
			]);
		});

		test("should handle URIs at start and end of text", () => {
			const text = "@github://repo1 some text @gitlab://repo2";
			const matches = Array.from(matchAllURIs(text));
			expect(matches).toHaveLength(2);
			expect(matches[0][0]).toBe("@github://repo1");
			expect(matches[1][0]).toBe("@gitlab://repo2");
		});
	});
});
