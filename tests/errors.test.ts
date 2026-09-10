import { afterAll, describe, expect, test } from 'bun:test';
import { errorMessage, formatError, isClientAbort } from '../src/server/errors.js';
import { installProcessGuards, resetProcessGuardsForTests } from '../src/server/guards.js';
import { logError } from '../src/server/logger.js';

describe('errorMessage', () => {
  test('reads message from Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  test('falls back to name for a message-less Error', () => {
    expect(errorMessage(new TypeError())).toBe('TypeError');
  });

  test('describes undefined instead of throwing', () => {
    expect(errorMessage(undefined)).toContain('undefined');
  });

  test('describes null instead of throwing', () => {
    expect(errorMessage(null)).toContain('null');
  });

  test('passes strings through', () => {
    expect(errorMessage('plain failure')).toBe('plain failure');
  });

  test('uses message field of plain objects', () => {
    expect(errorMessage({ message: 'object failure' })).toBe('object failure');
  });

  test('serialises objects without a message', () => {
    expect(errorMessage({ code: 42 })).toBe('{"code":42}');
  });

  test('handles numbers and symbols', () => {
    expect(errorMessage(500)).toBe('500');
    expect(errorMessage(false)).toBe('false');
  });
});

describe('formatError', () => {
  test('includes name, message and stack frames', () => {
    const formatted = formatError(new Error('kaput'));
    expect(formatted).toContain('Error: kaput');
    expect(formatted).toContain('at ');
  });

  test('includes error code when present', () => {
    const err = Object.assign(new Error('socket gone'), { code: 'ECONNRESET' });
    expect(formatError(err)).toContain('code: ECONNRESET');
  });

  test('unwraps causes', () => {
    const err = new Error('outer', { cause: new Error('inner') });
    const formatted = formatError(err);
    expect(formatted).toContain('caused by:');
    expect(formatted).toContain('Error: inner');
  });

  test('unwraps aggregated errors', () => {
    const err = new AggregateError([new Error('first'), new Error('second')], 'both failed');
    const formatted = formatError(err);
    expect(formatted).toContain('Error: first');
    expect(formatted).toContain('Error: second');
  });

  test('never returns an empty string for undefined', () => {
    const formatted = formatError(undefined);
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain('undefined');
  });
});

describe('isClientAbort', () => {
  test('detects AbortError', () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    expect(isClientAbort(err)).toBe(true);
  });

  test('detects socket-level codes', () => {
    expect(isClientAbort(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isClientAbort(Object.assign(new Error('x'), { code: 'EPIPE' }))).toBe(true);
  });

  test('detects disconnect phrasing', () => {
    expect(isClientAbort(new Error('The connection was closed'))).toBe(true);
  });

  test('does not swallow real errors', () => {
    expect(isClientAbort(new Error('Things3 is not running'))).toBe(false);
    expect(isClientAbort(undefined)).toBe(false);
    expect(isClientAbort('nope')).toBe(false);
  });
});

describe('logError', () => {
  test('never throws, whatever it is handed', () => {
    const original = console.error;
    const written: string[] = [];
    console.error = (...args: unknown[]) => {
      written.push(args.join(' '));
    };
    try {
      for (const value of [undefined, null, 'oops', 42, new Error('boom'), { a: 1 }, []]) {
        expect(() => logError('test failure', value)).not.toThrow();
      }
    } finally {
      console.error = original;
    }
    const output = written.join('\n');
    expect(output).toContain('test failure');
    expect(output).toContain('boom');
  });
});

describe('installProcessGuards', () => {
  const before = {
    rejection: process.listeners('unhandledRejection'),
    exception: process.listeners('uncaughtException'),
  };

  resetProcessGuardsForTests();
  installProcessGuards();

  const added = {
    rejection: process.listeners('unhandledRejection').filter((l) => !before.rejection.includes(l)),
    exception: process.listeners('uncaughtException').filter((l) => !before.exception.includes(l)),
  };

  afterAll(() => {
    // Do not leave crash handlers behind — they would mask failures in other tests.
    for (const listener of added.rejection) process.off('unhandledRejection', listener);
    for (const listener of added.exception) process.off('uncaughtException', listener);
    resetProcessGuardsForTests();
  });

  test('registers handlers for both crash sources', () => {
    expect(added.rejection.length).toBe(1);
    expect(added.exception.length).toBe(1);
  });

  test('is idempotent', () => {
    const countBefore = process.listenerCount('unhandledRejection');
    installProcessGuards();
    installProcessGuards();
    expect(process.listenerCount('unhandledRejection')).toBe(countBefore);
  });

  test('survives an undefined rejection reason', () => {
    expect(() => added.rejection[0]?.(undefined, Promise.resolve())).not.toThrow();
  });
});
