import { describe, expect, test } from 'bun:test';
import {
  buildDateVar,
  buildProperties,
  capitalize,
  isTerminologyFailure,
  quoteString,
  tellThings,
} from '../src/utils/applescript.js';

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

describe('buildDateVar', () => {
  test('builds AppleScript date from ISO string', () => {
    const result = buildDateVar('2026-03-15', 'dueD');
    expect(result).toContain('set day of dueD to 1');
    expect(result).toContain('set year of dueD to 2026');
    expect(result).toContain('set month of dueD to 3');
    expect(result).toContain('set day of dueD to 15');
    expect(result).toContain('set time of dueD to 0');
  });

  test('sets day to 1 before year/month to prevent overflow', () => {
    const result = buildDateVar('2026-02-15', 'dueD');
    const lines = result.split('\n');
    const dayTo1Index = lines.findIndex((l) => l.includes('set day of dueD to 1'));
    const monthIndex = lines.findIndex((l) => l.includes('set month of dueD to 2'));
    expect(dayTo1Index).toBeLessThan(monthIndex);
  });

  test('uses custom variable name', () => {
    const result = buildDateVar('2024-12-25', 'myDate');
    expect(result).toContain('set myDate to current date');
    expect(result).toContain('set day of myDate to 1');
    expect(result).toContain('set year of myDate to 2024');
    expect(result).toContain('set month of myDate to 12');
    expect(result).toContain('set day of myDate to 25');
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

describe('isTerminologyFailure', () => {
  test('recognises a lost class name', () => {
    expect(
      isTerminologyFailure('60:62: syntax error: Expected class name but found “to”. (-2741)'),
    ).toBe(true);
  });

  test('recognises the -2740 variant', () => {
    expect(
      isTerminologyFailure(
        "31:39: syntax error: A class name can't go after this identifier. (-2740)",
      ),
    ).toBe(true);
  });

  test('recognises a class demoted to a variable', () => {
    expect(
      isTerminologyFailure('42:46: execution error: The variable tags is not defined. (-2753)'),
    ).toBe(true);
  });

  test('recognises a blocked Apple Event', () => {
    expect(isTerminologyFailure("Things3 got an error: Application isn't running. (-600)")).toBe(
      true,
    );
  });

  test('leaves a genuine Things3 error alone', () => {
    expect(
      isTerminologyFailure('execution error: Things3 got an error: Can’t get area "AI". (-1728)'),
    ).toBe(false);
  });
});
