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

/**
 * Get all resources in the document and find which one contains the cursor position
 */
function getResourceAtPosition(
	state: EditorState,
	pos: number,
): { from: number; to: number; uri: string } | null {
	const resources = state.field(resourcesField);
	const doc = state.doc;

	// Search around the cursor position for resources
	const line = doc.lineAt(pos);
	const lineText = doc.sliceString(line.from, line.to);
	const matches = Array.from(matchAllURIs(lineText));

	for (const match of matches) {
		const resourceStart = line.from + match.index;
		const resourceEnd = resourceStart + match[0].length;
		const uri = match[0].slice(1); // Remove @ prefix

		// Check if cursor is within this resource and it exists
		if (pos >= resourceStart && pos <= resourceEnd && resources.has(uri)) {
			return { from: resourceStart, to: resourceEnd, uri };
		}
	}

	return null;
}

/**
 * Find the next resource boundary when moving left
 */
function getResourceBoundaryLeft(
	state: EditorState,
	pos: number,
): number | null {
	const resources = state.field(resourcesField);
	const doc = state.doc;
	const line = doc.lineAt(pos);
	const lineText = doc.sliceString(line.from, pos);
	const matches = Array.from(matchAllURIs(lineText));

	// Find the rightmost resource that ends before or at cursor position
	let bestBoundary: number | null = null;
	for (const match of matches) {
		const resourceStart = line.from + match.index;
		const resourceEnd = resourceStart + match[0].length;
		const uri = match[0].slice(1);

		if (resources.has(uri) && resourceEnd <= pos) {
			if (pos > resourceEnd) {
				// Cursor is after resource - jump to end of resource
				bestBoundary = resourceEnd;
			} else if (pos === resourceEnd) {
				// Cursor is at end of resource - jump to start of resource
				bestBoundary = resourceStart;
			}
		}
	}

	return bestBoundary;
}

/**
 * Find the next resource boundary when moving right
 */
function getResourceBoundaryRight(
	state: EditorState,
	pos: number,
): number | null {
	const resources = state.field(resourcesField);
	const doc = state.doc;
	const line = doc.lineAt(pos);
	const lineText = doc.sliceString(pos, line.to);
	const matches = Array.from(matchAllURIs(lineText));

	// Find the leftmost resource that starts at or after cursor position
	for (const match of matches) {
		const resourceStart = pos + match.index;
		const resourceEnd = resourceStart + match[0].length;
		const uri = match[0].slice(1);

		if (resources.has(uri)) {
			if (pos < resourceStart) {
				// Cursor is before resource - jump to start of resource
				return resourceStart;
			} else if (pos === resourceStart) {
				// Cursor is at start of resource - jump to end of resource
				return resourceEnd;
			}
		}
	}

	return null;
}

export const resourceInputFilter = EditorState.transactionFilter.of((tr: Transaction) => {
	const userEvent = tr.annotation(Transaction.userEvent);
	if (!userEvent) return tr;

	const sel = tr.startState.selection.main;
	if (!sel.empty) return tr;

	// Handle deletion events
	if (userEvent === "delete.backward" || userEvent === "delete.forward") {
		let resource: { from: number; to: number; uri: string } | null = null;
		if (userEvent === "delete.backward") {
			resource = getResourceAtCursor(tr.startState, sel.head);
		} else if (userEvent === "delete.forward") {
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
	}

	// Handle cursor movement events - check if it's a selection change with no selection
	if (tr.selection && tr.selection.main.empty && sel.empty) {
		// This is likely a cursor movement
		const oldPos = sel.head;
		const newPos = tr.selection.main.head;
		let targetPos: number | null = null;

		if (newPos < oldPos) {
			// Moving left
			const currentResource = getResourceAtPosition(tr.startState, oldPos);
			if (currentResource && oldPos > currentResource.from) {
				// If cursor was inside a resource, jump to the start
				targetPos = currentResource.from;
			} else {
				// Check for resource boundary to the left
				targetPos = getResourceBoundaryLeft(tr.startState, oldPos);
			}
		} else if (newPos > oldPos) {
			// Moving right
			const currentResource = getResourceAtPosition(tr.startState, oldPos);
			if (currentResource && oldPos < currentResource.to) {
				// If cursor was inside a resource, jump to the end
				targetPos = currentResource.to;
			} else {
				// Check for resource boundary to the right
				targetPos = getResourceBoundaryRight(tr.startState, oldPos);
			}
		}

		// If we found a target position, override the cursor movement
		if (targetPos !== null && targetPos !== newPos) {
			return [
				{
					selection: { anchor: targetPos },
					scrollIntoView: true,
				},
			];
		}
	}

	return tr;
});
