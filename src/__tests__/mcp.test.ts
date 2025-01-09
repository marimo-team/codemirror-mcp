import { CompletionContext } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, type Tooltip, showTooltip, tooltips } from "@codemirror/view";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
	InitializeResult,
	JSONRPCMessage,
	JSONRPCRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractResources, mcpExtension } from "../mcp";
import { resourcesField, updateResources } from "../state";

class MockTransport implements Transport {
	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: JSONRPCMessage) => void;

	mockResources = [
		{ name: "test1", uri: "test://1", type: "text" },
		{ name: "test2", uri: "test://2", type: "text" },
	];

	mockPrompts = [
		{ name: "prompt1", description: "Test prompt 1" },
		{ name: "prompt2", description: "Test prompt 2" },
	];

	async start(): Promise<void> {}

	async send(message: JSONRPCMessage): Promise<void> {
		if (!("method" in message)) return;
		const req = message as JSONRPCRequest;

		if (req.method === "initialize") {
			setTimeout(() => {
				const res: InitializeResult = {
					jsonrpc: "2.0",
					id: req.id,
					result: {
						capabilities: {},
					},
					protocolVersion: "2024-11-05",
					serverInfo: {
						name: "codemirror-mcp",
						version: "0.1.0",
					},
					capabilities: {},
				};
				this.onmessage?.({
					jsonrpc: "2.0",
					id: req.id,
					result: res,
				});
			}, 0);
		}

		if (req.method === "resources/list") {
			setTimeout(() => {
				this.onmessage?.({
					jsonrpc: "2.0",
					id: req.id,
					result: {
						resources: this.mockResources,
					},
				});
			}, 0);
		}

		if (req.method === "prompts/list") {
			setTimeout(() => {
				this.onmessage?.({
					jsonrpc: "2.0",
					id: req.id,
					result: {
						prompts: this.mockPrompts,
					},
				});
			}, 0);
		}
	}

	async close(): Promise<void> {
		this.onclose?.();
	}
}

describe("mcpExtension", () => {
	let transport: MockTransport;
	let view: EditorView;
	let state: EditorState;
	let mockLogger: Console;

	function getCompletionHandler(_state: EditorState) {
		const ext = mcpExtension({ transport, logger: mockLogger })[2];
		const handler = ext[2].value.override[0];
		return handler;
	}

	beforeEach(() => {
		transport = new MockTransport();
		mockLogger = {
			log: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
		} as unknown as Console;

		state = EditorState.create({
			doc: "Hello @",
			extensions: [
				markdown(),
				mcpExtension({ transport, logger: mockLogger, onClickResource: () => {} }),
				tooltips(),
			],
		});

		view = new EditorView({
			state,
			parent: document.createElement("div"),
		});
	});

	it("should connect to MCP server on initialization", async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mockLogger.log).toHaveBeenCalledWith("Connected to MCP server");
	});

	it("should provide completions when typing @", async () => {
		const context = new CompletionContext(state, 7, false);
		const handler = getCompletionHandler(state);
		const completions = await handler(context);

		expect(completions).toBeTruthy();
		expect(completions?.from).toBe(6);
		expect(completions?.options).toHaveLength(2);
		expect(completions?.options[0].label).toBe("@test1");
		expect(completions?.options[1].label).toBe("@test2");
	});

	it("should not provide completions when not typing @", async () => {
		const state = EditorState.create({
			doc: "Hello",
			extensions: [mcpExtension({ transport, logger: mockLogger })],
		});
		const view = new EditorView({ state, parent: document.createElement("div") });
		const context = new CompletionContext(view.state, 5, false);
		const handler = getCompletionHandler(view.state);
		const completions = await handler(context);

		expect(completions).toBeNull();
	});

	it.skip("should show tooltip when hovering over @mention", async () => {
		const mockTooltip: Tooltip = {
			pos: 6,
			end: 12,
			above: true,
			create(_view: EditorView) {
				const dom = document.createElement("div");
				dom.className = "cm-tooltip-cursor";
				dom.textContent = "test1 (test://1)";
				return { dom };
			},
		};

		const state = EditorState.create({
			doc: "Hello @test1",
			extensions: [mcpExtension({ transport, logger: mockLogger }), showTooltip.of(mockTooltip)],
		});
		const view = new EditorView({ state, parent: document.createElement("div") });

		// Force resources to be loaded
		const context = new CompletionContext(view.state, 7, false);
		const handler = getCompletionHandler(view.state);
		await handler(context);

		// Get tooltip at @mention position
		const [tooltip] = view.state.facet(showTooltip);
		expect(tooltip).toBeTruthy();
		expect(tooltip?.pos).toBe(6);
		expect(tooltip?.end).toBe(12);

		const dom = tooltip?.create(view).dom;
		expect(dom?.textContent).toBe("test1 (test://1)");
		expect(dom?.className).toBe("cm-tooltip-cursor");
	});

	it("should handle MCP server errors gracefully", async () => {
		transport.send = async () => {
			throw new Error("Server error");
		};

		const context = new CompletionContext(view.state, 7, false);
		const handler = getCompletionHandler(view.state);
		const completions = await handler(context);

		expect(completions).toBeNull();
		expect((mockLogger.error as Mock).mock.calls[0][0]).toBe("Failed to connect to MCP server:");
	});

	it("should provide prompt completions when typing /", async () => {
		transport.mockPrompts = [
			{ name: "prompt1", description: "Test prompt 1" },
			{ name: "prompt2", description: "Test prompt 2" },
		];

		const state = EditorState.create({
			doc: "Hello /",
			extensions: [mcpExtension({ transport, logger: mockLogger })],
		});
		const context = new CompletionContext(state, 7, false);
		const handler = getCompletionHandler(state);
		const completions = await handler(context);

		expect(completions).toBeTruthy();
		expect(completions?.from).toBe(6);
		expect(completions?.options).toHaveLength(2);
		expect(completions?.options[0].label).toBe("/prompt1");
		expect(completions?.options[1].label).toBe("/prompt2");
	});

	it("should not provide prompt completions when not typing /", async () => {
		const state = EditorState.create({
			doc: "Hello",
			extensions: [mcpExtension({ transport, logger: mockLogger })],
		});
		const context = new CompletionContext(state, 5, false);
		const handler = getCompletionHandler(state);
		const completions = await handler(context);

		expect(completions).toBeNull();
	});

	it("should handle prompts with descriptions", async () => {
		transport.mockPrompts = [
			{ name: "prompt1", description: "Test prompt 1" },
			{ name: "prompt2", description: "" },
		];

		const state = EditorState.create({
			doc: "Hello /",
			extensions: [mcpExtension({ transport, logger: mockLogger })],
		});
		const context = new CompletionContext(state, 7, false);
		const handler = getCompletionHandler(state);
		const completions = await handler(context);

		expect(completions?.options[0].detail).toBe("Test prompt 1");
		expect(completions?.options[0].boost).toBe(100);
		expect(completions?.options[1].detail).toBe("");
		expect(completions?.options[1].boost).toBe(0);
	});

	// TODO: test prompt completions
});

describe("extractResources", () => {
	let view: EditorView;
	let state: EditorState;

	beforeEach(() => {
		state = EditorState.create({
			doc: "",
			extensions: [resourcesField],
		});
		view = new EditorView({ state });
	});

	afterEach(() => {
		view.destroy();
	});

	it("should extract resources from text", () => {
		// Set up resources
		const resources = new Map([
			["test://1", { name: "test1", uri: "test://1", type: "text" }],
			["test://2", { name: "test2", uri: "test://2", type: "text" }],
		]);
		view.dispatch({
			changes: { from: 0, to: 0, insert: "Hello @test://1 world @test://2" },
			effects: updateResources.of(resources),
		});

		const matches = extractResources(view);
		expect(matches).toMatchInlineSnapshot(`
			[
			  {
			    "end": 15,
			    "resource": {
			      "name": "test1",
			      "type": "text",
			      "uri": "test://1",
			    },
			    "start": 6,
			  },
			  {
			    "end": 31,
			    "resource": {
			      "name": "test2",
			      "type": "text",
			      "uri": "test://2",
			    },
			    "start": 22,
			  },
			]
		`);
	});

	it("should handle text without resources", () => {
		view.dispatch({
			changes: { from: 0, to: 0, insert: "Hello world!" },
			effects: updateResources.of(new Map()),
		});

		const matches = extractResources(view);
		expect(matches).toHaveLength(0);
	});

	it("should handle unknown resources", () => {
		const resources = new Map([["test://1", { name: "test1", uri: "test://1", type: "text" }]]);
		view.dispatch({
			changes: { from: 0, to: 0, insert: "Hello @test://1 @unknown://2" },
			effects: updateResources.of(resources),
		});

		const matches = extractResources(view);
		expect(matches).toHaveLength(1);
		expect(matches[0]).toEqual({
			resource: resources.get("test://1"),
			start: 6,
			end: 15,
		});
	});

	it("should handle empty text", () => {
		const resources = new Map([["test://1", { name: "test1", uri: "test://1", type: "text" }]]);
		view.dispatch({
			effects: updateResources.of(resources),
		});

		const matches = extractResources(view);
		expect(matches).toHaveLength(0);
	});
});
