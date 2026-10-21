/**
 * IPC-backed run repository (issue #23).
 *
 * Implements the `RunRepository` port over `start_run` (with its pre-bound
 * `Channel`) and `cancel_run`, mapping the wire frames to domain frames. The
 * tool call is mapped here so the presentation model never sees a DTO.
 */
import type { ToolCall } from '@/shared/domain/tool-call.types';
import type { ToolCallDto } from '@/features/conversations/api/conversation.contracts';
import type { RunFrame, StartRunInput } from '../model/live-run';
import { cancelRun, startRunStream } from './run-client';
import type { RunStreamEventDto, StartRunRequestDto } from './run.contracts';
import type { RunRepository } from './run-repository';

function toToolCall(dto: ToolCallDto): ToolCall {
  return {
    id: dto.id,
    kind: dto.kind,
    summary: dto.summary,
    detail: dto.detail,
    status: dto.status,
    subagentId: dto.subagentId
  };
}

/** Maps one wire frame to its domain frame; exhaustive over the six kinds. */
export function toRunFrame(dto: RunStreamEventDto): RunFrame {
  switch (dto.kind) {
    case 'started':
    case 'completed':
    case 'cancelled':
      return { kind: dto.kind, runId: dto.runId, seq: dto.seq };
    case 'textDelta':
      return {
        kind: 'textDelta',
        runId: dto.runId,
        seq: dto.seq,
        text: dto.text
      };
    case 'toolActivity':
      return {
        kind: 'toolActivity',
        runId: dto.runId,
        seq: dto.seq,
        toolCall: toToolCall(dto.toolCall)
      };
    case 'failed':
      return {
        kind: 'failed',
        runId: dto.runId,
        seq: dto.seq,
        error: dto.error
      };
  }
}

function toStartRunRequest(input: StartRunInput): StartRunRequestDto {
  return {
    conversationId: input.conversationId,
    projectId: input.projectId,
    providerId: input.providerId,
    modelId: input.modelId,
    effortLevel: input.effortLevel,
    prompt: input.prompt,
    environment: {
      useNewWorktree: input.environment.useNewWorktree,
      gitBranch: input.environment.gitBranch,
      environmentName: input.environment.environmentName
    }
  };
}

/** Builds the run port over the typed IPC client. */
export function createIpcRunRepository(): RunRepository {
  return {
    startRun(input, onFrame) {
      const subscription = startRunStream(toStartRunRequest(input), frame =>
        onFrame(toRunFrame(frame))
      );
      return {
        runId: subscription.run.then(run => run.runId),
        unsubscribe: () => subscription.unsubscribe()
      };
    },
    cancelRun(runId) {
      return cancelRun(runId).then(run => run.status);
    }
  };
}
