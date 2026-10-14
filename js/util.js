export class CancelledError extends Error {
  constructor() {
    super('Anulowano');
    this.name = 'CancelledError';
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Kolejka z limitem równoległych zadań. `wanted` pozwala pominąć zadanie,
// które przestało być potrzebne (np. miniatura przewinięta poza ekran).
export function createQueue(concurrency) {
  const jobs = [];
  let active = 0;

  const pump = () => {
    while (active < concurrency && jobs.length) {
      const job = jobs.shift();
      if (job.wanted && !job.wanted()) {
        job.reject(new CancelledError());
        continue;
      }
      active++;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  };

  return (run, wanted) =>
    new Promise((resolve, reject) => {
      jobs.push({ run, wanted, resolve, reject });
      pump();
    });
}
