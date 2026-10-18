import type { Hook } from '@/shared/domain/hook.types';
import { getHookMessages } from '../../messages';
import { formatHookTimeout } from '../../model/hook-review';
import './hook-detail.css';

export interface HookDetailProps {
  readonly hook: Hook;
}

/** Provider-reported metadata, rendered verbatim rather than interpreted. */
export function HookDetail({ hook }: HookDetailProps) {
  const messages = getHookMessages().hookReview;
  return (
    <dl className="hook-detail">
      <div className="hook-detail__field">
        <dt>{messages.originLabel}</dt>
        <dd>{hook.origin}</dd>
      </div>
      <div className="hook-detail__field">
        <dt>{messages.hookTypeLabel}</dt>
        <dd>{hook.hookType}</dd>
      </div>
      <div className="hook-detail__field">
        <dt>{messages.commandLabel}</dt>
        <dd>
          <code className="hook-detail__command">{hook.command}</code>
        </dd>
      </div>
      <div className="hook-detail__field">
        <dt>{messages.timeoutLabel}</dt>
        <dd>{formatHookTimeout(hook.timeoutMs)}</dd>
      </div>
    </dl>
  );
}
