/**
 * Settle with `fallback` when `task` has not settled within `timeLimit` ms.
 * A rejection of `task` also resolves to `fallback`, so callers get a value
 * either way and never wait longer than the limit.
 *
 * @param timeLimit in milliseconds
 * @param task the promise to wait for
 * @param fallback the value used on timeout or failure
 */
export const withTimeout = <T, F>(
  timeLimit: number,
  task: Promise<T>,
  fallback: F
): Promise<T | F> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<F>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeLimit);
  });
  return Promise.race([
    task.catch(() => fallback),
    timeoutPromise,
  ]).finally(() => clearTimeout(timer));
};
