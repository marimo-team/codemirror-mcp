import { type Completion, type CompletionContext, autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
	GetPromptResultSchema,
	type Implementation,
	ListPromptsResultSchema,
	type Resource as MCPResource,
	type PromptMessage,
} from "@modelcontextprotocol/sdk/types.js";
import { MCPResourceProvider } from "./mcp/mcp-provider.js";
import { resourceCompletion } from "./resources/completion.js";
import { resourceDecorations } from "./resources/decoration.js";
import { type HoverResourceOptions, hoverResource } from "./resources/hover.js";
import { type Resource, toMCPResource } from "./resources/resource.js";
import { mcpOptionsField, promptsField, resourcesField, updatePrompts } from "./state.js";
import { resourceTheme } from "./theme.js";

export interface MCPOptions {
	/** Transport layer for MCP client-server communication */
	transport: Transport;
	/** Optional implementation-specific client options */
	clientOptions?: Implementation;
	/** Optional logger for debugging, defaults to console */
	logger?: typeof console;
	/** Optional callback when a resource is clicked */
	onResourceClick?: (resource: MCPResource) => void;
	/** Optional callback when hovering over a resource */
	onResourceMouseOver?: (resource: MCPResource) => void;
	/** Optional callback when hovering out of a resource */
	onResourceMouseOut?: (resource: MCPResource) => void;
	/** Optional callback when a prompt is triggered */
	onPromptSubmit?: (opts: { messages: PromptMessage[] }) => void;

	/** Optional hover options */
	hoverOptions?: HoverResourceOptions;
}

interface CompletionHandlerContext {
	word: { from: number; to: number } | null;
	connected: boolean;
	resourceProvider: MCPResourceProvider;
	client: Client;
	logger?: typeof console;
	context: CompletionContext;
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

export function mcpExtension(options: MCPOptions): Extension {
	const logger = options.logger;
	const resourceProvider = new MCPResourceProvider(
		options.transport,
		options.clientOptions,
		logger,
	);

	const completion = autocompletion({
		override: [
			async (context: CompletionContext) => {
				// Handle resource completions (@)
				const resourceWord = context.matchBefore(/@(\w+)?/);
				if (resourceWord) {
					const connected = await resourceProvider.isConnected();
					if (!connected) {
						logger?.error("MCP client is not connected");
						return null;
					}

					logger?.log("Fetching resources from MCP server");

					return resourceCompletion(() => resourceProvider.getResources())(context);
				}

				// Handle prompt completions (/)
				const promptWord = context.matchBefore(/\/(\w+)?/);
				if (promptWord) {
					return handlePromptCompletion({
						connected: await resourceProvider.isConnected(),
						resourceProvider,
						client: resourceProvider.getClient(),
						logger,
						context,
						word: promptWord,
					});
				}

				return null;
			},
		],
	});

	const adaptResource = (callback?: (resource: MCPResource) => void) => {
		if (!callback) return undefined;

		return (mcpResource: Resource) => {
			callback(toMCPResource(mcpResource));
		};
	};

	return [
		resourcesField,
		promptsField,
		completion,
		resourceTheme,
		hoverResource(options.hoverOptions ?? {}),
		resourceDecorations,
		mcpOptionsField.init(() => ({
			onResourceClick: adaptResource(options.onResourceClick),
			onResourceMouseOver: adaptResource(options.onResourceMouseOver),
			onResourceMouseOut: adaptResource(options.onResourceMouseOut),
			onPromptSubmit: options.onPromptSubmit,
		})),
	];
}
