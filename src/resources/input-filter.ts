import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { resourcesField } from "../state.js";
import { matchAllURIs } from "../utils.js";

/**
 * Check if cursor is at the end of a resource
 */
function getResourceAtCursor(
	state: EditorState,
	pos: number,
): { from: number; to: number; uri: string } | null {
	const resources = state.field(resourcesField);
	const doc = state.doc;

	// Look backward from cursor to find resource
	const lineStart = doc.lineAt(pos).from;
	const textBefore = doc.sliceString(lineStart, pos);

	// Find all resources in the line up to cursor
	const matches = Array.from(matchAllURIs(textBefore));
	if (matches.length === 0) return null;

	// Get the last match (closest to cursor)
	const lastMatch = matches[matches.length - 1];
	const resourceStart = lineStart + lastMatch.index;
	const resourceEnd = resourceStart + lastMatch[0].length;
	const uri = lastMatch[0].slice(1); // Remove @ prefix

	// Check if cursor is at the end of this resource and resource exists
	if (pos === resourceEnd && resources.has(uri)) {
		return { from: resourceStart, to: resourceEnd, uri };
	}

	return null;
}

/**
 * Check if cursor is at the beginning of a resource
 */
function getResourceAfterCursor(
	state: EditorState,
	pos: number,
): { from: number; to: number; uri: string } | null {
	const resources = state.field(resourcesField);
	const doc = state.doc;

	// Look forward from cursor to find resource
	const lineEnd = doc.lineAt(pos).to;
	const textAfter = doc.sliceString(pos, lineEnd);

	// Find resource starting at cursor position
	const matches = Array.from(matchAllURIs(textAfter));
	if (matches.length === 0) return null;

	const firstMatch = matches[0];
	if (firstMatch.index !== 0) return null; // Resource must start at cursor

	const resourceStart = pos;
	const resourceEnd = pos + firstMatch[0].length;
	const uri = firstMatch[0].slice(1); // Remove @ prefix

	// Check if resource exists
	if (resources.has(uri)) {
		return { from: resourceStart, to: resourceEnd, uri };
	}

	return null;
}

export const resourceInputFilter = EditorState.transactionFilter.of((tr: Transaction) => {
	// Only care about explicit delete.backward/delete.forward
	const del = tr.annotation(Transaction.userEvent);
	if (del !== "delete.backward" && del !== "delete.forward") return tr;

	const sel = tr.startState.selection.main;
	if (!sel.empty) return tr;

	let resource: { from: number; to: number; uri: string } | null = null;
	if (del === "delete.backward") {
		resource = getResourceAtCursor(tr.startState, sel.head);
	} else if (del === "delete.forward") {
		resource = getResourceAfterCursor(tr.startState, sel.head);
	}
	if (!resource) return tr;

	// Replace the resource with nothing, keep cursor at start
	return [
		{
			changes: { from: resource.from, to: resource.to, insert: "" },
			selection: { anchor: resource.from },
			scrollIntoView: true,
		},
	];
});
