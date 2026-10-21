/**
 * Drives one folder pick for the create-project dialog (#147).
 *
 * The picker is a port: at runtime it opens the native dialog through the Rust
 * core, and tests inject their own. The hook owns only the presentation facts
 * of a pick — whether one is in flight (so the add control cannot open a second
 * dialog) and whether the last one failed.
 */
import { useEffect, useRef, useState } from 'react';
import { createIpcWorkspaceFolderPicker } from '../api/ipc-workspace-folder-picker';
import type { WorkspaceFolderPicker } from '../api/workspace-folder-picker';
import type { SourceFolder } from '../model/create-project.types';

export interface WorkspaceFolderPicking {
  readonly isPicking: boolean;
  readonly hasPickError: boolean;
  /** Opens the picker; `onPicked` receives the chosen folder (never `null`). */
  readonly pickFolder: (onPicked: (folder: SourceFolder) => void) => void;
}

export function useWorkspaceFolderPicker(
  picker?: WorkspaceFolderPicker
): WorkspaceFolderPicking {
  const [defaultPicker] = useState(createIpcWorkspaceFolderPicker);
  const activePicker = picker ?? defaultPicker;
  const [isPicking, setIsPicking] = useState(false);
  const [hasPickError, setHasPickError] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  function pickFolder(onPicked: (folder: SourceFolder) => void) {
    if (isPicking) {
      return;
    }

    setIsPicking(true);
    setHasPickError(false);
    void activePicker
      .pickFolder()
      .then(folder => {
        // A cancelled dialog adds nothing.
        if (isMounted.current && folder) {
          onPicked(folder);
        }
      })
      .catch(() => {
        if (isMounted.current) {
          setHasPickError(true);
        }
      })
      .finally(() => {
        if (isMounted.current) {
          setIsPicking(false);
        }
      });
  }

  return { isPicking, hasPickError, pickFolder };
}
