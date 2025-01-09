import {
  WidgetType,
  type EditorView,
  type DecorationSet,
  Decoration,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { resourcesField, resourceClickHandlerField, updateResources } from './state.js';
import type { Range } from '@codemirror/state';
import { matchAllURIs, URI_PATTERN } from './utils.js';

// Widget for resource decoration
class ResourceWidget extends WidgetType {
  constructor(readonly resource: Resource, readonly view: EditorView) {
    super();
  }

  eq(other: ResourceWidget) {
    return other.resource.uri === this.resource.uri;
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-resource-widget';
    wrap.textContent = `@${this.resource.name}`;
    wrap.title = this.resource.uri;

    const clickHandler = this.view.state.field(resourceClickHandlerField, false);
    if (clickHandler) {
      wrap.style.cursor = 'pointer';
      wrap.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clickHandler(this.resource);
      });
    }

    return wrap;
  }
}

// Create decorations from resources
function createResourceDecorations(view: EditorView): DecorationSet {
  const resources = view.state.field(resourcesField);
  const decorations: Range<Decoration>[] = [];

  for (let { from, to } of view.visibleRanges) {
    let text = view.state.doc.sliceString(from, to);
    let matches = matchAllURIs(text);

    for (let match of matches) {
      let start = from + match.index!;
      let uri = match[0].slice(1); // Remove @ prefix
      let resource = resources.get(uri);

      if (resource) {
        decorations.push(
          Decoration.replace({
            widget: new ResourceWidget(resource, view),
          }).range(start, start + match[0].length)
        );
      }
    }
  }

  return Decoration.set(decorations);
}

// ViewPlugin for resource decorations
export const resourceDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createResourceDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tr) => tr.effects.some((e) => e.is(updateResources)))
      ) {
        this.decorations = createResourceDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
