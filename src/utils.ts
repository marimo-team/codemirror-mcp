export const URI_PATTERN = /@[\w-]+:\/\/(?!\/)[^\s]+/;

export function matchAllURIs(text: string) {
  return text.matchAll(new RegExp(URI_PATTERN.source, 'g'));
}
