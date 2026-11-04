/**
 * The thing asked for does not exist in Things3. Matched by `name`, not `instanceof`:
 * tests replace whole api modules with mocks, and a class identity would not survive that.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.name === 'NotFoundError';
}

/** A name matched more than one object in Things3 — the caller has to pick one by id. */
export class AmbiguousError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousError';
  }
}

export function isAmbiguous(err: unknown): boolean {
  return err instanceof Error && err.name === 'AmbiguousError';
}
