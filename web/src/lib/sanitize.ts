/**
 * Remove HTML tags from provider synopses, which arrive as fragments of
 * markup we render as plain text.
 *
 * The sweep repeats until the string stops changing, so a removal can never
 * leave behind something tag-shaped that a single pass would have missed.
 * (React escapes what it renders either way — this is about the text reading
 * correctly, and about not shipping a one-pass strip that only looks like a
 * sanitiser.)
 */
export function stripTags(input: string): string {
  let out = input;
  let previous: string;
  do {
    previous = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== previous);
  return out;
}

/**
 * The URL if it is safe to put in an `href`, otherwise undefined. A feed URL
 * is typed by hand and rendered back as a link, so `javascript:` has to be
 * turned away before it becomes one. Only absolute http(s) URLs qualify.
 */
export function externalHref(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
}
