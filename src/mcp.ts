import { type Completion, type CompletionContext, autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
	GetPromptResultSchema,
	type Implementation,
	ListPromptsResultSchema,
	ListResourcesResultSchema,
	type PromptMessage,
	type Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { resourceDecorations } from "./decoration.js";
import { hoverResource } from "./hover.js";
import {
	mcpOptionsField,
	promptsField,
	resourcesField,
	updatePrompts,
	updateResources,
} from "./state.js";
import { resourceTheme } from "./theme.js";
import { matchAllURIs } from "./utils.js";

export interface MCPOptions {
	/** Transport layer for MCP client-server communication */
	transport: Transport;
	/** Optional implementation-specific client options */
	clientOptions?: Implementation;
	/** Optional logger for debugging, defaults to console */
	logger?: typeof console;
	/** Optional callback when a resource is clicked */
	onResourceClick?: (resource: Resource) => void;
	/** Optional callback when hovering over a resource */
	onResourceMouseOver?: (resource: Resource) => void;
	/** Optional callback when hovering out of a resource */
	onResourceMouseOut?: (resource: Resource) => void;
	/** Optional callback when a prompt is triggered */
	onPromptSubmit?: (opts: { messages: PromptMessage[] }) => void;
}

interface CompletionHandlerContext {
	word: { from: number; to: number } | null;
	connected: boolean;
	client: Client;
	logger?: typeof console;
	context: CompletionContext;
}

async function handleResourceCompletion({
	word,
	connected,
	client,
	logger,
	context,
}: CompletionHandlerContext) {
	if (!word) return null;
	if (word.from === word.to && !context.explicit) return null;
	if (!connected) {
		logger?.error("MCP client is not connected");
		return null;
	}

	logger?.log("Fetching resources from MCP server");

	try {
		// Fetch resources from MCP server
		const response = await client.request({ method: "resources/list" }, ListResourcesResultSchema);
		const resources = response.resources;
		if (resources.length === 0) {
			return null;
		}
		const effects = updateResources.of(
			new Map(resources.map((resource) => [resource.uri, resource])),
		);

		if (context.view) {
			context.view.dispatch({ effects });
		}

		logger?.log(`Got ${resources.length} resources from MCP server`);

		// Convert resources to completion items
		const options = resources.map(
			(resource: Resource): Completion => ({
				label: `@${resource.name}`,
				displayLabel: resource.name,
				detail: resource.uri,
				info: resource.description || undefined,
				type: resource.mimeType ? "constant" : "variable",
				boost: resource.description ? 100 : 0,
				apply: (view, _completion, from, to) => {
					view.dispatch({
						changes: { from, to, insert: `@${resource.uri}` },
					});
				},
			}),
		);

		return {
			from: word.from,
			options,
		};
	} catch (error) {
		logger?.error("Failed to fetch MCP resources:", error);
		return null;
	}
}

async function handlePromptCompletion({
	word,
	connected,
	client,
	logger,
	context,
}: CompletionHandlerContext) {
	if (!word) return null;
	if (word.from === word.to && !context.explicit) return null;
	if (!connected) {
		logger?.error("MCP client is not connected");
		return null;
	}

	logger?.log("Fetching prompts from MCP server");

	try {
		// Fetch prompts from MCP server
		const response = await client.request({ method: "prompts/list" }, ListPromptsResultSchema);
		const prompts = response.prompts;
		// TODO: Implement prompt with args
		// Not implemented yet, ideally looks a bit like slack completions
		// /read_table [table_name]
		// /read_table [table_name] [column_name]
		// /read_table [table_name] [column_name] [row_id]
		const promptWithoutArgs = prompts.filter(
			(prompt) => !prompt.args || Object.keys(prompt.args).length === 0,
		);
		if (promptWithoutArgs.length === 0) {
			return null;
		}

		const effects = updatePrompts.of(
			new Map(promptWithoutArgs.map((prompt) => [prompt.name, prompt])),
		);

		if (context.view) {
			context.view.dispatch({ effects });
		}

		logger?.log(`Got ${prompts.length} prompts from MCP server`);

		// // Convert prompts to completion items
		const options = prompts.map(
			(prompt): Completion => ({
				label: `/${prompt.name}`,
				displayLabel: prompt.name,
				detail: prompt.description,
				type: "keyword",
				boost: prompt.description ? 100 : 0,
				apply: async (view, _completion, _from, _to) => {
					const mcpOptions = view.state.field(mcpOptionsField);
					if (!mcpOptions.onPromptSubmit) {
						logger?.error("No onPromptSubmit callback set");
						throw new Error("No onPromptSubmit callback set");
					}

					// Load the prompt template
					const promptResult = await client.request(
						{ method: "prompts/get", params: { name: prompt.name } },
						GetPromptResultSchema,
					);

					mcpOptions.onPromptSubmit(promptResult);
				},
			}),
		);

		return {
			from: word.from,
			options,
		};
	} catch (error) {
		logger?.error("Failed to fetch MCP prompts:", error);
		return null;
	}
}

export function extractResources(view: EditorView): Array<{
	resource: Resource;
	start: number;
	end: number;
}> {
	const text = view.state.doc.toString();
	const resources = view.state.field(resourcesField);
	const matches: Array<{
		resource: Resource;
		// Position in the text, including the @ prefix
		start: number;
		end: number;
	}> = [];
	for (const match of matchAllURIs(text)) {
		const start = match.index;
		const end = start + match[0].length;

		const uri = match[0].slice(1); // Remove @ prefix
		const resource = resources.get(uri);
		if (resource) {
			matches.push({ resource, start, end });
		}
	}
	return matches;
}

export function mcpExtension(options: MCPOptions): Extension {
	const logger = options.logger;
	const client = new Client(
		{
			name: options.clientOptions?.name ?? "codemirror-mcp",
			version: options.clientOptions?.version ?? "0.1.0",
		},
		{
			capabilities: {},
		},
	);

	const connectedPromise = client
		.connect(options.transport)
		.then(() => {
			logger?.log("Connected to MCP server");
			return true;
		})
		.catch((error) => {
			logger?.error("Failed to connect to MCP server:", error);
			return false;
		});

	const completion = autocompletion({
		override: [
			async (context: CompletionContext) => {
				const connected = await connectedPromise;
				const handlerContext: Omit<CompletionHandlerContext, "word"> = {
					connected,
					client,
					logger,
					context,
				};

				// Handle resource completions (@)
				const resourceWord = context.matchBefore(/@(\w+)?/);
				if (resourceWord) {
					return handleResourceCompletion({ ...handlerContext, word: resourceWord });
				}

				// Handle prompt completions (/)
				const promptWord = context.matchBefore(/\/(\w+)?/);
				if (promptWord) {
					return handlePromptCompletion({ ...handlerContext, word: promptWord });
				}

				return null;
			},
		],
	});

	return [
		resourcesField,
		promptsField,
		completion,
		resourceTheme,
		hoverResource(),
		resourceDecorations,
		mcpOptionsField.init(() => ({
			onResourceClick: options.onResourceClick,
			onResourceMouseOver: options.onResourceMouseOver,
			onResourceMouseOut: options.onResourceMouseOut,
			onPromptSubmit: options.onPromptSubmit,
		})),
	];
}
