import { EditorView } from '@codemirror/view';

// Theme for resource decorations
export const resourceTheme = EditorView.baseTheme({
  '.cm-resource-widget': {
    background: 'rgba(86, 156, 214, 0.1)',
    borderRadius: '4px',
    padding: '2px 4px',
    color: '#569cd6',
    fontWeight: '500',
  },
  '.cm-resource-widget:hover': {
    background: 'rgba(86, 156, 214, 0.2)',
  },
});
