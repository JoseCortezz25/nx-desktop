/**
 * Files a conversation message points at, and the request a file chip emits to
 * open one of them.
 *
 * `docs/wireframes/README.md` ("Reusable components") draws `FileChip`s as
 * inline links to a file inside a message: clicking one opens the right panel.
 * The reference is a plain workspace-relative path — the chip never resolves,
 * reads or renders the file; it only asks the shell to open it.
 *
 * `OpenFileRequest` is that ask. The conversation view only emits it and the
 * window shell owns it once, so the panel ticket (#12) consumes the same value
 * instead of keeping a second copy.
 */

/** A file referenced inline inside a conversation message. */
export interface FileReference {
  /** Workspace-relative path of the referenced file. */
  readonly path: string;
}

/** A request to open one file in the right panel, emitted by a `FileChip`. */
export interface OpenFileRequest {
  /** Workspace-relative path of the file to open. */
  readonly path: string;
}
