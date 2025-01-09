import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { mcpExtension } from '../src';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { InitializeResult, JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import { tooltips } from '@codemirror/view';

class DemoTransport implements Transport {
  constructor() {}

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Simulate sending message
    console.log('Sending message:', message);

    if (!('method' in message)) {
      return;
    }
    const req = message as JSONRPCRequest;

    if (req.method === 'initialize') {
      setTimeout(() => {
        const res: InitializeResult = {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            capabilities: {},
          },
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'codemirror-mcp',
            version: '0.1.0',
          },
          capabilities: {},
        };
        this.onmessage?.({
          jsonrpc: '2.0',
          id: req.id,
          result: res,
        });
      }, 100);
    }

    // Simulate response for resources/list
    if (req.method === 'resources/list') {
      setTimeout(() => {
        if (this.onmessage) {
          this.onmessage({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              resources: [
                {
                  name: 'readme',
                  uri: 'file://docs/README.md',
                  type: 'file',
                  mimeType: 'text/markdown',
                  description: 'Project documentation and getting started guide',
                },
                {
                  name: 'calculateTotal',
                  uri: 'function://utils/calculateTotal',
                  type: 'function',
                  mimeType: 'application/javascript',
                  description: 'Calculates total price including tax and shipping',
                },
                {
                  name: 'API_KEY',
                  uri: 'var://config/API_KEY',
                  type: 'variable',
                  mimeType: 'text/plain',
                  description: 'Authentication key for external API access',
                },
                {
                  name: 'salesData2023',
                  uri: 'data://analytics/sales2023.csv',
                  type: 'dataset',
                  mimeType: 'text/csv',
                  description: 'Annual sales records with customer demographics',
                },
              ],
            },
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

  const editor = new EditorView({
    doc: `# Example Document

Try typing @ to see MCP completions!

@`,
    // extensions: [basicSetup, markdown(), mcpExtension({ transport, logger: console }), tooltips()],
    extensions: [basicSetup, markdown(), mcpExtension({ transport, logger: console }), tooltips()],
    parent: document.querySelector('#editor')!,
  });
})();
