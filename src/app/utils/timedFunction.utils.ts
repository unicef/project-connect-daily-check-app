import { Observable } from 'rxjs';

/**
 *  This function takes a task and a time limit and returns a promise that resolves to the
 * task's response or a failure value if the task takes longer than the time limit.
 *
 * @param timeLimit  in milliseconds
 * @param task  the task to be performed
 * @param failureValue  the value to be returned if the task fails
 * @returns
 */
export const timedFunction = async <T>(
  timeLimit: number,
  task: Observable<T>,
  failureValue
) => {
  let timeout;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      resolve(failureValue);
    }, timeLimit);
  });
  const response = Promise.race([task.toPromise(), timeoutPromise]);
  if (timeout) {
    //the code works without this but let's be safe and clean up the timeout
    clearTimeout(timeout);
  }
  return response;
};
