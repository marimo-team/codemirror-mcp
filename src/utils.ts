export const URI_PATTERN = /@[\w-]+:\/\/(?!\/)[^\s]+/;

export function matchAllURIs(text: string) {
	return text.matchAll(new RegExp(URI_PATTERN.source, "g"));
}

export function invariant(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}
