import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCPResourceProvider } from "../mcp/mcp-provider.js";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: vi.fn().mockImplementation(() => ({
		connect: vi.fn().mockResolvedValue(undefined),
		request: vi.fn(),
	})),
}));

const createMockTransport = (): Transport => ({
	start: vi.fn().mockResolvedValue(undefined),
	close: vi.fn().mockResolvedValue(undefined),
	send: vi.fn().mockResolvedValue(undefined),
	onmessage: undefined,
	onerror: undefined,
	onclose: undefined,
});

const createMockLogger = () =>
	({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	}) as unknown as typeof console;

describe("MCPResourceProvider", () => {
	let mockTransport: Transport;
	let mockLogger: typeof console;

	beforeEach(() => {
		mockTransport = createMockTransport();
		mockLogger = createMockLogger();
		vi.clearAllMocks();
	});

	describe("constructor", () => {
		it("should create provider with default client options", () => {
			const provider = new MCPResourceProvider(mockTransport);
			expect(provider).toBeDefined();
		});

		it("should create provider with custom client options", () => {
			const provider = new MCPResourceProvider(
				mockTransport,
				{ name: "custom-client", version: "1.0.0" },
				mockLogger,
			);
			expect(provider).toBeDefined();
		});

		it("should create provider with logger", () => {
			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);
			expect(provider).toBeDefined();
		});
	});

	describe("getResources", () => {
		it("should throw error when client is not connected", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockRejectedValue(new Error("Connection failed")),
				request: vi.fn(),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);

			await expect(provider.getResources()).rejects.toThrow("MCP client is not connected");
			expect(mockLogger.error).toHaveBeenCalledWith(
				"Failed to connect to MCP server:",
				expect.any(Error),
			);
		});

		it("should return resources when client is connected", async () => {
			const mockResources = {
				resources: [
					{
						uri: "file://test.txt",
						name: "test.txt",
						description: "A test file",
						mimeType: "text/plain",
					},
				],
			};

			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi.fn().mockResolvedValue(mockResources),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);
			const resources = await provider.getResources();

			expect(resources).toHaveLength(1);
			expect(resources[0]).toMatchObject({
				uri: "file://test.txt",
				name: "test.txt",
				description: "A test file",
				mimeType: "text/plain",
			});
			expect(mockLogger.log).toHaveBeenCalledWith("Connected to MCP server");
		});

		it("should handle empty resources list", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi.fn().mockResolvedValue({ resources: [] }),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);
			const resources = await provider.getResources();

			expect(resources).toHaveLength(0);
		});

		it("should handle API errors gracefully", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi.fn().mockRejectedValue(new Error("API Error")),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);

			await expect(provider.getResources()).rejects.toThrow("API Error");
		});
	});

	describe("getResource", () => {
		it("should throw error when client is not connected", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockRejectedValue(new Error("Connection failed")),
				request: vi.fn(),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);

			await expect(provider.getResource("test://uri")).rejects.toThrow(
				"MCP client is not connected",
			);
		});

		it("should return resource content when successful", async () => {
			const mockListResponse = {
				resources: [
					{
						uri: "file://test.txt",
						name: "test.txt",
						mimeType: "text/plain",
					},
				],
			};

			const mockResourceContent = {
				contents: [
					{
						uri: "file://test.txt",
						mimeType: "text/plain",
						text: "Hello, world!",
					},
				],
			};

			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi
					.fn()
					.mockResolvedValueOnce(mockListResponse) // First call for list
					.mockResolvedValueOnce(mockResourceContent), // Second call for read
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);
			const resource = await provider.getResource("file://test.txt");

			expect(resource).toMatchObject({
				uri: "file://test.txt",
				mimeType: "text/plain",
				data: "Hello, world!",
			});
		});

		it("should handle binary resource content", async () => {
			const mockListResponse = {
				resources: [
					{
						uri: "file://test.bin",
						name: "test.bin",
						mimeType: "application/octet-stream",
					},
				],
			};

			const mockResourceContent = {
				contents: [
					{
						uri: "file://test.bin",
						mimeType: "application/octet-stream",
						blob: "base64encodeddata",
					},
				],
			};

			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi
					.fn()
					.mockResolvedValueOnce(mockListResponse) // First call for list
					.mockResolvedValueOnce(mockResourceContent), // Second call for read
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);
			const resource = await provider.getResource("file://test.bin");

			expect(resource).toMatchObject({
				uri: "file://test.bin",
				mimeType: "application/octet-stream",
				data: "base64encodeddata",
			});
		});

		it("should handle missing resource", async () => {
			const mockListResponse = {
				resources: [], // No resources found
			};

			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi.fn().mockResolvedValueOnce(mockListResponse), // Only list call
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);
			const resource = await provider.getResource("file://missing.txt");

			expect(resource).toBeNull();
		});

		it("should handle API errors gracefully", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi.fn().mockRejectedValue(new Error("Resource not found")),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);

			await expect(provider.getResource("file://missing.txt")).rejects.toThrow(
				"Resource not found",
			);
		});
	});

	describe("connection handling", () => {
		it("should cache connection promise", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const connectSpy = vi.fn().mockResolvedValue(undefined);
			const mockClient = {
				connect: connectSpy,
				request: vi.fn().mockResolvedValue({ resources: [] }),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);

			// Call getResources multiple times
			await Promise.all([
				provider.getResources(),
				provider.getResources(),
				provider.getResources(),
			]);

			// Connection should only be attempted once
			expect(connectSpy).toHaveBeenCalledTimes(1);
		});

		it("should handle connection failures consistently", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockRejectedValue(new Error("Connection failed")),
				request: vi.fn(),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);

			// All calls should fail consistently
			await expect(provider.getResources()).rejects.toThrow("MCP client is not connected");
			await expect(provider.getResource("test://uri")).rejects.toThrow(
				"MCP client is not connected",
			);
		});
	});

	describe("error handling", () => {
		it("should handle malformed response data", async () => {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const mockClient = {
				connect: vi.fn().mockResolvedValue(undefined),
				request: vi.fn().mockResolvedValue({ invalid: "response" }),
			};
			vi.mocked(Client).mockReturnValue(mockClient as any);

			const provider = new MCPResourceProvider(mockTransport, undefined, mockLogger);

			// This should handle malformed responses gracefully
			await expect(provider.getResources()).resolves.toBeDefined();
		});
	});
});
