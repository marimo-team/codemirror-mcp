# codemirror-mcp

> ⚠️ **Warning**: This package is in active development and the API may change without notice.

A CodeMirror extension that implements the Model Context Protocol (MCP) for enhanced code editing capabilities.

## Features

- Resource Completion: Autocomplete for `@resource` mentions
- Resource Decorations: Visual styling for `@resource` mentions with click handling
- Prompt Completion: Autocomplete for `/prompt` commands
- Theme Support: Customizable styling

## Installation

```bash
npm install @marimo-team/codemirror-mcp
# or
pnpm add @marimo-team/codemirror-mcp
```

## Peer Dependencies

This module requires the following peer dependencies:

- `@codemirror/view`
- `@codemirror/state`
- `@modelcontextprotocol/sdk`

## Usage

```ts
import { mcpExtension } from '@marimo-team/codemirror-mcp';
import { EditorView } from '@codemirror/view';

const view = new EditorView({
  extensions: [
    // ... other extensions
    mcpExtension({
      // Required
      transport: yourMCPTransport,

      // Optional
      logger: console,
      clientOptions: {
        name: 'your-client',
        version: '1.0.0'
      },
      onResourceClick: (resource) => {
        // Open resource
      },
    })
  ],
  parent: document.querySelector('#editor')
});
```

## Resource Features

- Use `@resource-uri` syntax to reference resources
- Resources are visually decorated and clickable
- Click handling for resource interactions
- Hover tooltips show resource details
- Customizable theme

## Prompt Features

- Use `/command` syntax for prompt commands
- Autocomplete for available prompts

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test
```

## License

MIT
