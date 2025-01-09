# codemirror-mcp

A CodeMirror extension that implements the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) for resource mentions and prompt commands.

## Features

- Resource Completion: Autocomplete for `@resource` mentions
- Resource Decorations: Visual styling for `@resource` mentions with click handling
- Prompt Completion: Autocomplete for `/prompt` commands
- Theme Support: Customizable styling

## Installation

```bash
npm install @marimo-team/codemirror-mcp @modelcontextprotocol/sdk
# or
pnpm add @marimo-team/codemirror-mcp @modelcontextprotocol/sdk
```

### Peer Dependencies

This module requires the following peer dependencies:

- `@codemirror/view`
- `@codemirror/state`
- `@modelcontextprotocol/sdk`

## Usage

```ts
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { mcpExtension, extractResources } from '@marimo-team/codemirror-mcp';
import { EditorView } from '@codemirror/view';

const transport = new WebSocketClientTransport(new URL('ws://localhost:8080'));

const view = new EditorView({
  extensions: [
    // ... other extensions

    mcpExtension({
      // Required options
      transport: transport,

      // Optional options
      logger: console,
      clientOptions: {
        name: 'your-client',
        version: '1.0.0'
      },
      onResourceClick: (resource) => {
        // Open resource
        // e.g. open in a tab, etc.
      },
    }),

    // Handle submit
    keymap.of([
      {
        key: 'Enter',
        run: () => {
          const resources = extractResources(view);
          const formattedResources = resources
            .map(
              ({ resource }) =>
                `${resource.uri} (${resource.type}): ${resource.description || resource.name}`
            )
            .join('\n');
          const prompt = `${view.state.doc.toString()}\n\nResources:\n${formattedResources}`;
          // ... submit prompt to AI server
          // const response = await generateText(prompt);
        },
      },
    ]),
  ],
  parent: document.querySelector('#editor'),
});
```

## Resources

- Use `@resource-uri` syntax to reference resources
- Resources are visually decorated and clickable
- Click handling for resource interactions
- Hover tooltips show resource details
- Customizable theme

## Prompts

- Use `/command` syntax for prompt commands
- Autocomplete for available prompts

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run demo
pnpm dev
```

## License

MIT
