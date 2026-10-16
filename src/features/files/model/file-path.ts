/**
 * Workspace-relative path helpers shared by the right panel's file surfaces.
 *
 * The panel names a file the way the conversation chip does: a
 * workspace-relative path with `/` separators (`docs/wireframes/README.md`,
 * screen 23). The tab strip, the breadcrumb and the viewer all derive their
 * labels from that one form, so the helpers live here instead of being repeated
 * per component.
 */

/** Final segment of a workspace-relative path: the tab and viewer label. */
export function fileName(path: string): string {
  const segments = breadcrumbSegments(path);
  return segments[segments.length - 1] ?? path;
}

/** Lower-cased extension without the dot, or `''` when the name carries none. */
export function fileExtension(path: string): string {
  const name = fileName(path);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex <= 0 ? '' : name.slice(dotIndex + 1).toLowerCase();
}

/**
 * Path segments in the order the screen-23 breadcrumb draws them. Empty
 * segments (a leading, trailing or doubled separator) are dropped so a
 * normalized path and a raw one describe the same crumb chain.
 */
export function breadcrumbSegments(path: string): readonly string[] {
  return path.split('/').filter(segment => segment.length > 0);
}
