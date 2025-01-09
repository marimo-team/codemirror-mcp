import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, showTooltip, type Tooltip, tooltips } from '@codemirror/view';
import { mcpExtension } from '../index';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { InitializeResult, JSONRPCRequest, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { CompletionContext } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';

class MockTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  mockResources = [
    { name: 'test1', uri: 'test://1', type: 'text' },
    { name: 'test2', uri: 'test://2', type: 'text' },
  ];

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (!('method' in message)) return;
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
      }, 0);
    }

    if (req.method === 'resources/list') {
      setTimeout(() => {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            resources: this.mockResources,
          },
        });
      }, 0);
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

describe('mcpExtension', () => {
  let transport: MockTransport;
  let view: EditorView;
  let state: EditorState;
  let mockLogger: Console;

  function getCompletionHandler(state: EditorState) {
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
      doc: 'Hello @',
      extensions: [markdown(), mcpExtension({ transport, logger: mockLogger, onClickResource: () => {} }), tooltips()],
    });

    view = new EditorView({
      state,
      parent: document.createElement('div'),
    });
  });

  it('should connect to MCP server on initialization', async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockLogger.log).toHaveBeenCalledWith('Connected to MCP server');
  });

  it('should provide completions when typing @', async () => {
    const context = new CompletionContext(state, 7, false);
    const handler = getCompletionHandler(state);
    const completions = await handler(context);

    expect(completions).toBeTruthy();
    expect(completions?.from).toBe(6);
    expect(completions?.options).toHaveLength(2);
    expect(completions?.options[0].label).toBe('@test1');
    expect(completions?.options[1].label).toBe('@test2');
  });

  it('should not provide completions when not typing @', async () => {
    const state = EditorState.create({
      doc: 'Hello',
      extensions: [mcpExtension({ transport, logger: mockLogger })],
    });
    const view = new EditorView({ state, parent: document.createElement('div') });
    const context = new CompletionContext(view.state, 5, false);
    const handler = getCompletionHandler(view.state);
    const completions = await handler(context);

    expect(completions).toBeNull();
  });

  it.skip('should show tooltip when hovering over @mention', async () => {
    const mockTooltip: Tooltip = {
      pos: 6,
      end: 12,
      above: true,
      create(view: EditorView) {
        const dom = document.createElement('div');
        dom.className = 'cm-tooltip-cursor';
        dom.textContent = 'test1 (test://1)';
        return { dom };
      },
    };

    const state = EditorState.create({
      doc: 'Hello @test1',
      extensions: [mcpExtension({ transport, logger: mockLogger }), showTooltip.of(mockTooltip)],
    });
    const view = new EditorView({ state, parent: document.createElement('div') });

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
    expect(dom?.textContent).toBe('test1 (test://1)');
    expect(dom?.className).toBe('cm-tooltip-cursor');
  });

  it('should handle MCP server errors gracefully', async () => {
    transport.send = async () => {
      throw new Error('Server error');
    };

    const context = new CompletionContext(view.state, 7, false);
    const handler = getCompletionHandler(view.state);
    const completions = await handler(context);

    expect(completions).toBeNull();
    expect((mockLogger.error as any).mock.calls[0][0]).toBe('Failed to connect to MCP server:');
  });

  // TODO: test prompt completions
});
