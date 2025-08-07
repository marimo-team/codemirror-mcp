import { autocompletion } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { tooltips } from "@codemirror/view";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
	GetPromptResult,
	InitializeResult,
	JSONRPCMessage,
	JSONRPCRequest,
	PromptMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { EditorView, basicSetup } from "codemirror";
import {
	extractResources,
	hoverResource,
	resourceCompletion,
	resourceInputFilter,
	resourceTheme,
	resourcesField,
} from "../src";
import type { Resource } from "../src";
import { mcpExtension } from "../src/mcp";
import { resourceDecorations } from "../src/resources/decoration";

class DemoTransport implements Transport {
	mockPrompts = [
		{ name: "prompt1", description: "Test prompt 1" },
		{ name: "prompt2", description: "Test prompt 2" },
	];

	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: (message: JSONRPCMessage) => void;

	async start(): Promise<void> {
		// Simulate connection delay
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	async send(message: JSONRPCMessage): Promise<void> {
		// Simulate sending message
		// biome-ignore lint/suspicious/noConsole: <explanation>
		console.log("Sending message:", message);

		if (!("method" in message)) {
			return;
		}
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
			}, 100);
		}

		// Simulate response for resources/list
		if (req.method === "resources/list") {
			setTimeout(() => {
				if (this.onmessage) {
					this.onmessage({
						jsonrpc: "2.0",
						id: req.id,
						result: {
							resources: [
								{
									name: "readme",
									uri: "file://docs/README.md",
									type: "file",
									mimeType: "text/markdown",
									description: "Project documentation and getting started guide",
								},
								{
									name: "calculateTotal",
									uri: "function://utils/calculateTotal",
									type: "function",
									mimeType: "application/javascript",
									description: "Calculates total price including tax and shipping",
								},
								{
									name: "API_KEY",
									uri: "var://config/API_KEY",
									type: "variable",
									mimeType: "text/plain",
									description: "Authentication key for external API access",
								},
								{
									name: "salesData2023",
									uri: "data://analytics/sales2023.csv",
									type: "dataset",
									mimeType: "text/csv",
									description: "Annual sales records with customer demographics",
								},
							],
						},
					});
				}
			}, 100);
		}

		// Simulate response for prompts/list
		if (req.method === "prompts/list") {
			setTimeout(() => {
				if (this.onmessage) {
					this.onmessage({
						jsonrpc: "2.0",
						id: req.id,
						result: {
							prompts: this.mockPrompts,
						},
					});
				}
			}, 100);
		}

		// Simulate get prompt
		if (req.method === "prompts/get") {
			setTimeout(() => {
				if (this.onmessage) {
					const messages: PromptMessage[] = [
						{ role: "user", content: { type: "text", text: "I need help with my project" } },
						{ role: "assistant", content: { type: "text", text: "I can help you with that" } },
					];
					const res: GetPromptResult = { messages };
					this.onmessage({
						jsonrpc: "2.0",
						id: req.id,
						result: res,
					});
				}
			}, 100);
		}
	}

	async close(): Promise<void> {
		this.onclose?.();
	}
}

(async () => {
	// Create a transport - you'll need to replace this with your actual MCP server
	const transport = new DemoTransport();
	const extensions = [
		basicSetup,
		markdown(),
		mcpExtension({
			transport,
			logger: console,
			onResourceClick: (resource) => {
				alert(`clicked ${resource.uri} (${resource.name})`);
			},
			onPromptSubmit: ({ messages }) => {
				alert(
					`submitted messages: \n${messages.map((m) => `${m.role}: ${m.content.text}`).join("\n")}`,
				);
			},
		}),
		tooltips(),
	];

	const editor = new EditorView({
		doc: `# Example Document

Try typing @ to see MCP completions!

@`,
		extensions,
		parent: document.querySelector("#editor") ?? undefined,
	});

	const promptEditor = new EditorView({
		extensions,
		parent: document.querySelector("#prompts") ?? undefined,
	});

	// Add a button to extract resources
	const button = document.createElement("button");
	button.classList.add(
		"bg-blue-500",
		"hover:bg-blue-700",
		"text-white",
		"font-bold",
		"py-2",
		"px-4",
		"rounded",
	);
	const prompt = document.createElement("pre");
	button.textContent = "Submit";
	button.onclick = () => {
		const resources = extractResources(editor);
		const formattedResources = resources
			.map(
				({ resource }) =>
					`<resource>${resource.uri} (${resource.type}): ${resource.description || resource.name}</resource>`,
			)
			.join("\n");

		if (formattedResources.length === 0) {
			prompt.textContent = "No resources found";
		} else {
			prompt.textContent = `
<doc>
${editor.state.doc.toString()}
</doc>

Resources:
${formattedResources}
      `;
		}
	};
	document.querySelector("#editor")?.parentElement?.appendChild(button);
	document.querySelector("#editor")?.parentElement?.appendChild(prompt);

	// Create a demo using lower-level primitives without MCP extension
	const mockResources: Resource[] = [
		{
			name: "userGuide",
			uri: "file://docs/user-guide.md",
			mimeType: "text/markdown",
			description: "Complete user guide with examples and best practices",
			type: "file",
			data: {},
		},
		{
			name: "apiDocs",
			uri: "file://docs/api.md",
			mimeType: "text/markdown",
			description: "API reference documentation",
			type: "file",
			data: {},
		},
		{
			name: "config",
			uri: "var://app/config",
			mimeType: "application/json",
			description: "Application configuration object",
			type: "variable",
			data: {},
		},
		{
			name: "processData",
			uri: "function://utils/processData",
			mimeType: "application/javascript",
			description: "Processes user input data and returns formatted results",
			type: "function",
			data: {},
		},
	];

	const markdownLanguage = markdown();

	// Create extensions using primitives
	const primitivesExtensions = [
		basicSetup,
		markdownLanguage,
		resourcesField,
		resourceDecorations,
		resourceInputFilter,
		autocompletion({
			override: [
				resourceCompletion(
					async () => mockResources,
					// Custom formatter for completions
					(resource) => ({
						detail: `${resource.mimeType || "unknown"} - ${resource.uri}`,
						boost: resource.description ? 90 : 50,
					}),
				),
			],
		}),
		hoverResource({
			createTooltip: (resource) => {
				const dom = document.createElement("div");
				dom.className = "cm-tooltip-cursor cm-tooltip-below";
				dom.style.padding = "8px";
				dom.style.backgroundColor = "#f8f9fa";
				dom.style.border = "1px solid #dee2e6";
				dom.style.borderRadius = "4px";
				dom.style.maxWidth = "300px";

				const title = document.createElement("strong");
				title.textContent = resource.name;
				title.style.color = "#495057";
				dom.appendChild(title);

				const uri = document.createElement("div");
				uri.style.fontSize = "0.85em";
				uri.style.color = "#6c757d";
				uri.style.fontFamily = "monospace";
				uri.textContent = resource.uri;
				dom.appendChild(uri);

				if (resource.description) {
					const desc = document.createElement("div");
					desc.style.marginTop = "6px";
					desc.style.fontSize = "0.9em";
					desc.textContent = resource.description;
					dom.appendChild(desc);
				}

				if (resource.mimeType) {
					const mime = document.createElement("div");
					mime.style.marginTop = "4px";
					mime.style.fontSize = "0.8em";
					mime.style.color = "#868e96";
					mime.textContent = `Type: ${resource.mimeType}`;
					dom.appendChild(mime);
				}

				return { dom };
			},
		}),
		resourceTheme,
		tooltips(),
	];

	const primitivesEditor = new EditorView({
		doc: `# Primitives Demo

This editor demonstrates using the lower-level exported primitives:
- \`resourceCompletion\` for autocomplete functionality
- \`hoverResource\` for hover tooltips
- \`resourcesField\` for state management
- \`resourceTheme\` for styling
- Standard CodeMirror markdown support

Try typing @ to see resource completions, then hover over the inserted resources:

@`,
		extensions: primitivesExtensions,
		parent: document.querySelector("#primitives-editor") ?? undefined,
	});

	return { editor, promptEditor, primitivesEditor };
})();
