/**
 * Minimal `useState` / `useEffect` runtime for testing feature hooks in the node
 * runner (no DOM, no renderer).
 *
 * A hook test mocks `react` with {@link reactHookMock} and drives the hook with
 * {@link renderHook}: each `render` re-runs the hook with stable state slots,
 * then runs the effects whose dependencies changed (cleaning up the previous
 * run first), the same ordering React guarantees. Async work is flushed by the
 * test (`await flushPromises()`) and observed after the next `rerender`.
 *
 * Test-only: production code never imports this module.
 */

type StateUpdate = unknown | ((current: unknown) => unknown);

interface EffectSlot {
  readonly deps: readonly unknown[] | undefined;
  readonly cleanup: (() => void) | undefined;
}

const runtime = {
  states: [] as unknown[],
  effects: [] as (EffectSlot | undefined)[],
  pending: [] as (() => void)[],
  stateIndex: 0,
  effectIndex: 0
};

function depsChanged(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[] | undefined
): boolean {
  if (previous === undefined || next === undefined) {
    return true;
  }
  return (
    previous.length !== next.length ||
    next.some((value, index) => !Object.is(value, previous[index]))
  );
}

function useState(initial: unknown): [unknown, (next: StateUpdate) => void] {
  const index = runtime.stateIndex++;
  if (!(index in runtime.states)) {
    runtime.states[index] =
      typeof initial === 'function' ? (initial as () => unknown)() : initial;
  }
  function setState(next: StateUpdate) {
    runtime.states[index] =
      typeof next === 'function'
        ? (next as (current: unknown) => unknown)(runtime.states[index])
        : next;
  }
  return [runtime.states[index], setState];
}

function useEffect(
  effect: () => (() => void) | void,
  deps?: readonly unknown[]
): void {
  const index = runtime.effectIndex++;
  const previous = runtime.effects[index];
  if (previous !== undefined && !depsChanged(previous.deps, deps)) {
    return;
  }
  runtime.pending.push(() => {
    previous?.cleanup?.();
    const cleanup = effect();
    runtime.effects[index] = {
      deps,
      cleanup: typeof cleanup === 'function' ? cleanup : undefined
    };
  });
}

/** The `react` surface feature hooks use, backed by the runtime above. */
export const reactHookMock = { useState, useEffect };

export interface RenderedHook<TProps, TResult> {
  /** The value the hook returned on the latest render. */
  readonly result: () => TResult;
  /** Re-runs the hook, optionally with new props, then its changed effects. */
  readonly rerender: (...nextProps: [] | [TProps]) => void;
  /** Runs every effect cleanup, as an unmount would. */
  readonly unmount: () => void;
}

/** Mounts `hook` with fresh state slots and runs its first effects. */
export function renderHook<TProps, TResult>(
  hook: (props: TProps) => TResult,
  initialProps: NoInfer<TProps>
): RenderedHook<TProps, TResult> {
  runtime.states = [];
  runtime.effects = [];
  let props = initialProps;
  let latest: TResult | undefined;
  let hasRendered = false;

  function render() {
    runtime.stateIndex = 0;
    runtime.effectIndex = 0;
    runtime.pending = [];
    latest = hook(props);
    hasRendered = true;
    const effects = runtime.pending;
    runtime.pending = [];
    effects.forEach(run => run());
  }

  render();

  return {
    result() {
      if (!hasRendered) {
        throw new Error('hook has not rendered');
      }
      return latest as TResult;
    },
    rerender(...nextProps) {
      if (nextProps.length > 0) {
        props = nextProps[0] as TProps;
      }
      render();
    },
    unmount() {
      runtime.effects.forEach(slot => slot?.cleanup?.());
      runtime.effects = [];
    }
  };
}

/** Lets every already-settled promise callback run. */
export function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** A promise whose settlement the test controls, to order late responses. */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
