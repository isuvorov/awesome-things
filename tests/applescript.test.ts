import { describe, expect, test } from 'bun:test';
import { buildProperties, capitalize, quoteString, tellThings } from '../src/utils/applescript.js';

describe('quoteString', () => {
  test('wraps simple string in quotes', () => {
    expect(quoteString('hello')).toBe('"hello"');
  });

  test('escapes double quotes', () => {
    expect(quoteString('say "hi"')).toBe('"say \\"hi\\""');
  });

  test('escapes backslashes', () => {
    expect(quoteString('path\\to')).toBe('"path\\\\to"');
  });

  test('handles empty string', () => {
    expect(quoteString('')).toBe('""');
  });

  test('escapes both backslashes and quotes', () => {
    expect(quoteString('a\\"b')).toBe('"a\\\\\\"b"');
  });
});

describe('buildProperties', () => {
  test('returns {} for empty array', () => {
    expect(buildProperties([])).toBe('{}');
  });

  test('builds single property', () => {
    expect(buildProperties([['name', '"Test"']])).toBe('{name:"Test"}');
  });

  test('builds multiple properties', () => {
    const result = buildProperties([
      ['name', '"Test"'],
      ['notes', '"My notes"'],
    ]);
    expect(result).toBe('{name:"Test", notes:"My notes"}');
  });
});

describe('capitalize', () => {
  test('capitalizes first letter', () => {
    expect(capitalize('inbox')).toBe('Inbox');
  });

  test('handles single char', () => {
    expect(capitalize('a')).toBe('A');
  });

  test('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });

  test('keeps already capitalized', () => {
    expect(capitalize('Today')).toBe('Today');
  });

  test('handles all caps', () => {
    expect(capitalize('TODAY')).toBe('TODAY');
  });
});

describe('tellThings', () => {
  test('wraps command in tell block', () => {
    const result = tellThings('return name of to dos');
    expect(result).toBe('tell application "Things3"\nreturn name of to dos\nend tell');
  });

  test('wraps multiline command', () => {
    const result = tellThings('set x to 1\nreturn x');
    expect(result).toContain('tell application "Things3"');
    expect(result).toContain('set x to 1\nreturn x');
    expect(result).toContain('end tell');
  });
});
