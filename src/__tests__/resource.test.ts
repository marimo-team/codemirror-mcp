import { describe, expect, it } from "vitest";
import { type Resource, fromMCPResource, toMCPResource } from "../resources/resource.js";

describe("resource utilities", () => {
	describe("fromMCPResource", () => {
		it("should convert MCP resource to generic resource with string data", () => {
			const mcpResource = {
				uri: "file://test.txt",
				name: "test.txt",
				description: "A test file",
				mimeType: "text/plain",
			};

			const data = "Hello, world!";
			const resource = fromMCPResource(mcpResource, data);

			expect(resource).toEqual({
				type: "file",
				uri: "file://test.txt",
				name: "test.txt",
				description: "A test file",
				mimeType: "text/plain",
				data: "Hello, world!",
			});
		});

		it("should convert MCP resource to generic resource with object data", () => {
			const mcpResource = {
				uri: "api://users/123",
				name: "User Profile",
				description: "User profile data",
				mimeType: "application/json",
			};

			const data = { id: 123, name: "John Doe", email: "john@example.com" };
			const resource = fromMCPResource(mcpResource, data);

			expect(resource).toEqual({
				type: "api",
				uri: "api://users/123",
				name: "User Profile",
				description: "User profile data",
				mimeType: "application/json",
				data: { id: 123, name: "John Doe", email: "john@example.com" },
			});
		});

		it("should handle MCP resource without optional fields", () => {
			const mcpResource = {
				uri: "simple://resource",
				name: "Simple Resource",
			};

			const data = null;
			const resource = fromMCPResource(mcpResource, data);

			expect(resource).toEqual({
				type: "simple",
				uri: "simple://resource",
				name: "Simple Resource",
				description: undefined,
				mimeType: undefined,
				data: null,
			});
		});

		it("should handle URI without protocol", () => {
			const mcpResource = {
				uri: "no-protocol-resource",
				name: "No Protocol",
			};

			const resource = fromMCPResource(mcpResource, "data");

			expect(resource.type).toBe("unknown");
		});

		it("should handle complex URI protocols", () => {
			const mcpResource = {
				uri: "custom-protocol+subprotocol://path/to/resource",
				name: "Complex URI",
			};

			const resource = fromMCPResource(mcpResource, "data");

			expect(resource.type).toBe("custom-protocol+subprotocol");
		});

		it("should handle undefined data", () => {
			const mcpResource = {
				uri: "test://resource",
				name: "Test",
			};

			const resource = fromMCPResource(mcpResource, undefined);

			expect(resource.data).toBeUndefined();
		});

		it("should handle binary data", () => {
			const mcpResource = {
				uri: "file://image.png",
				name: "Image",
				mimeType: "image/png",
			};

			const binaryData = new Uint8Array([137, 80, 78, 71]); // PNG header
			const resource = fromMCPResource(mcpResource, binaryData);

			expect(resource.data).toEqual(binaryData);
			expect(resource.mimeType).toBe("image/png");
		});
	});

	describe("toMCPResource", () => {
		it("should convert generic resource to MCP format", () => {
			const resource: Resource<string> = {
				type: "file",
				uri: "file://test.txt",
				name: "test.txt",
				description: "A test file",
				mimeType: "text/plain",
				data: "Hello, world!",
			};

			const mcpResource = toMCPResource(resource);

			expect(mcpResource).toEqual({
				uri: "file://test.txt",
				name: "test.txt",
				description: "A test file",
				mimeType: "text/plain",
			});
		});

		it("should convert resource without optional fields", () => {
			const resource: Resource<number> = {
				type: "number",
				uri: "test://123",
				name: "Number Resource",
				data: 42,
			};

			const mcpResource = toMCPResource(resource);

			expect(mcpResource).toEqual({
				uri: "test://123",
				name: "Number Resource",
				description: undefined,
				mimeType: undefined,
			});
		});

		it("should exclude data field from MCP format", () => {
			const resource: Resource<object> = {
				type: "object",
				uri: "test://object",
				name: "Object Resource",
				description: "An object",
				mimeType: "application/json",
				data: { complex: "data", should: "not", be: "included" },
			};

			const mcpResource = toMCPResource(resource);

			expect(mcpResource).not.toHaveProperty("data");
			expect(mcpResource).not.toHaveProperty("type");
			expect(Object.keys(mcpResource)).toEqual(["uri", "name", "description", "mimeType"]);
		});

		it("should preserve undefined optional fields", () => {
			const resource: Resource<string> = {
				type: "test",
				uri: "test://resource",
				name: "Test Resource",
				description: undefined,
				mimeType: undefined,
				data: "test data",
			};

			const mcpResource = toMCPResource(resource);

			expect(mcpResource.description).toBeUndefined();
			expect(mcpResource.mimeType).toBeUndefined();
			expect(mcpResource).toHaveProperty("description");
			expect(mcpResource).toHaveProperty("mimeType");
		});
	});

	describe("roundtrip conversion", () => {
		it("should maintain data integrity in roundtrip conversion (excluding type and data)", () => {
			const originalMCPResource = {
				uri: "file://test.txt",
				name: "test.txt",
				description: "A test file",
				mimeType: "text/plain",
			};

			const data = "Hello, world!";

			// Convert to generic resource and back
			const genericResource = fromMCPResource(originalMCPResource, data);
			const backToMCP = toMCPResource(genericResource);

			expect(backToMCP).toEqual(originalMCPResource);
		});

		it("should handle roundtrip with missing optional fields", () => {
			const originalMCPResource = {
				uri: "test://resource",
				name: "Resource",
			};

			const genericResource = fromMCPResource(originalMCPResource, null);
			const backToMCP = toMCPResource(genericResource);

			expect(backToMCP.uri).toBe(originalMCPResource.uri);
			expect(backToMCP.name).toBe(originalMCPResource.name);
			expect(backToMCP.description).toBeUndefined();
			expect(backToMCP.mimeType).toBeUndefined();
		});
	});

	describe("type extraction", () => {
		it("should extract correct types from various URI schemes", () => {
			const testCases = [
				{ uri: "http://example.com", expectedType: "http" },
				{ uri: "https://secure.com", expectedType: "https" },
				{ uri: "file:///path/to/file", expectedType: "file" },
				{ uri: "ftp://ftp.example.com", expectedType: "ftp" },
				{ uri: "custom://resource", expectedType: "custom" },
				{ uri: "scheme+subscheme://resource", expectedType: "scheme+subscheme" },
				{ uri: "no-colon-resource", expectedType: "unknown" },
				{ uri: "://empty-scheme", expectedType: "" },
				{ uri: "", expectedType: "unknown" },
			];

			testCases.forEach(({ uri, expectedType }) => {
				const mcpResource = { uri, name: "test" };
				const resource = fromMCPResource(mcpResource, null);
				expect(resource.type).toBe(expectedType);
			});
		});
	});

	describe("data handling", () => {
		it("should preserve different data types", () => {
			const testCases = [
				{ data: "string", type: "string" },
				{ data: 42, type: "number" },
				{ data: true, type: "boolean" },
				{ data: { key: "value" }, type: "object" },
				{ data: [1, 2, 3], type: "array" },
				{ data: null, type: "null" },
				{ data: undefined, type: "undefined" },
			];

			testCases.forEach(({ data, type }) => {
				const mcpResource = {
					uri: `test://${type}`,
					name: `${type} resource`,
				};

				const resource = fromMCPResource(mcpResource, data);
				expect(resource.data).toEqual(data);
			});
		});
	});
});
