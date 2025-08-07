import type { EditorView } from "@codemirror/view";
import { resourcesField } from "../state.js";
import { matchAllURIs } from "../utils.js";
import type { Resource } from "./resource.js";

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
			matches.push({ resource: resource, start, end });
		}
	}
	return matches;
}
