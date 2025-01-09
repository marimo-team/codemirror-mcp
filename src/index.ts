import { type Extension } from '@codemirror/state';
import { type CompletionContext, autocompletion, type Completion } from '@codemirror/autocomplete';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  GetPromptResultSchema,
  Implementation,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  type Resource,
} from '@modelcontextprotocol/sdk/types.js';
import {
  resourcesField,
  updateResources,
  promptsField,
  updatePrompts,
  ResourceClickHandler,
  resourceClickHandlerField,
} from './state.js';
import { resourceTheme } from './theme.js';
import { hoverResource } from './hover.js';
import { resourceDecorations } from './decoration.js';

export interface MCPOptions {
  transport: Transport;
  clientOptions?: Implementation;
  logger?: typeof console;
  onClickResource?: ResourceClickHandler;
}

interface CompletionHandlerContext {
  word: { from: number; to: number } | null;
  connected: boolean;
  client: Client;
  logger?: typeof console;
  context: CompletionContext;
}

async function handleResourceCompletion({ word, connected, client, logger, context }: CompletionHandlerContext) {
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  if (!connected) {
    logger?.error('MCP client is not connected');
    return null;
  }

  logger?.log('Fetching resources from MCP server');

  try {
    // Fetch resources from MCP server
    const response = await client.request({ method: 'resources/list' }, ListResourcesResultSchema);
    const resources = response.resources;
    if (resources.length === 0) {
      return null;
    }
    const effects = updateResources.of(new Map(resources.map((resource) => [resource.uri, resource])));

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
        type: resource.mimeType ? 'constant' : 'variable',
        boost: resource.description ? 100 : 0,
        apply: (view, completion, from, to) => {
          view.dispatch({
            changes: { from, to, insert: `@${resource.uri}` },
          });
        },
      })
    );

    return {
      from: word.from,
      options,
    };
  } catch (error) {
    logger?.error('Failed to fetch MCP resources:', error);
    return null;
  }
}

async function handlePromptCompletion({ word, connected, client, logger, context }: CompletionHandlerContext) {
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  if (!connected) {
    logger?.error('MCP client is not connected');
    return null;
  }

  logger?.log('Fetching prompts from MCP server');

  try {
    // Fetch prompts from MCP server
    const response = await client.request({ method: 'prompts/list' }, ListPromptsResultSchema);
    const prompts = response.prompts;
    // TODO: Implement prompt with args
    // Not implemented yet, ideally looks a bit like slack completions
    // /read_table [table_name]
    // /read_table [table_name] [column_name]
    // /read_table [table_name] [column_name] [row_id]
    const promptWithoutArgs = prompts.filter((prompt) => !prompt.args || Object.keys(prompt.args).length === 0);
    if (promptWithoutArgs.length === 0) {
      return null;
    }

    const effects = updatePrompts.of(new Map(promptWithoutArgs.map((prompt) => [prompt.name, prompt])));

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
        type: 'keyword',
        boost: prompt.description ? 100 : 0,
        apply: async (view, completion, from, to) => {
          // Load the prompt template
          const promptResult = await client.request(
            { method: 'prompts/get', params: { name: prompt.name } },
            GetPromptResultSchema
          );
        },
      })
    );

    return {
      from: word.from,
      options,
    };
  } catch (error) {
    logger?.error('Failed to fetch MCP prompts:', error);
    return null;
  }
}

export function mcpExtension(options: MCPOptions): Extension {
  const logger = options.logger;
  const client = new Client(
    {
      name: options.clientOptions?.name ?? 'codemirror-mcp',
      version: options.clientOptions?.version ?? '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  const connectedPromise = client
    .connect(options.transport)
    .then(() => {
      logger?.log('Connected to MCP server');
      return true;
    })
    .catch((error) => {
      logger?.error('Failed to connect to MCP server:', error);
      return false;
    });

  const completion = autocompletion({
    override: [
      async (context: CompletionContext) => {
        const connected = await connectedPromise;
        const handlerContext: Omit<CompletionHandlerContext, 'word'> = {
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
    resourceClickHandlerField.init(() => options.onClickResource || null),
  ];
}
