/**
 * Port for the project list behind the sidebar.
 *
 * Backed by the mock repository today and by the future typed IPC client
 * (`project-client.ts`) once the Rust core exposes `list_projects`.
 */
import type { Project } from '@/shared/domain/project.types';

export interface ProjectRepository {
  listProjects(): Promise<readonly Project[]>;
}
