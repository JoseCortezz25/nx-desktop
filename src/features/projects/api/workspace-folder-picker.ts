/**
 * Port for choosing a source folder of a new project (#147).
 *
 * The runtime adapter opens the native folder dialog through the Rust core;
 * tests inject a stand-in, so no folder catalog is mocked in the product code.
 */
import type { SourceFolder } from '../model/create-project.types';

export interface WorkspaceFolderPicker {
  /** Resolves the folder the user chose, or `null` when they cancelled. */
  pickFolder(): Promise<SourceFolder | null>;
}
