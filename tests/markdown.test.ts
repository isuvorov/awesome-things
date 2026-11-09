import { describe, expect, test } from 'bun:test';
import { isSafeUrl, renderInline, renderMarkdown } from '../src/server/markdown.js';

describe('isSafeUrl', () => {
  test('accepts web and app links', () => {
    for (const url of ['https://a.dev', 'mailto:a@b.c', 'things:///show?id=1', 'obsidian://open']) {
      expect(isSafeUrl(url)).toBe(true);
    }
  });

  test('refuses script, data, file and relative urls', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:x',
      'data:text/html,x',
      'file:///etc',
      '/x',
      'x',
    ]) {
      expect(isSafeUrl(url)).toBe(false);
    }
  });
});

describe('renderInline', () => {
  test('links bare web urls in a new tab, leaving trailing punctuation out', () => {
    expect(renderInline('see https://a.dev/x?y=1&z=2.')).toBe(
      'see <a href="https://a.dev/x?y=1&amp;z=2" target="_blank" rel="noopener noreferrer">https://a.dev/x?y=1&amp;z=2</a>.',
    );
    expect(renderInline('(https://a.dev/x)')).toContain('href="https://a.dev/x"');
  });

  test('links bare app urls without opening an empty tab', () => {
    const url = 'obsidian://open?vault=xx-lifemanager&file=projects/garage-sale/bmw-black-hood';
    expect(renderInline(`Детали: ${url}`)).toBe(
      `Детали: <a href="${url.replace('&', '&amp;')}">${url.replace('&', '&amp;')}</a>`,
    );
  });

  test('renders [text](url) and <url> links', () => {
    expect(renderInline('[the *doc*](https://a.dev/(x))')).toBe(
      '<a href="https://a.dev/(x)" target="_blank" rel="noopener noreferrer">the <em>doc</em></a>',
    );
    expect(renderInline('<things:///show?id=1>')).toBe(
      '<a href="things:///show?id=1">things:///show?id=1</a>',
    );
  });

  test('never links a script url', () => {
    expect(renderInline('javascript:alert(1)')).not.toContain('<a');
    expect(renderInline('javascript://%0aalert(1)')).not.toContain('<a');
    expect(renderInline('[x](javascript:alert(1))')).not.toContain('<a');
    expect(renderInline('<javascript:alert(1)>')).not.toContain('<a');
  });

  test('renders emphasis, strikethrough, highlight and code', () => {
    expect(renderInline('**b** __b__ *i* _i_ ~~s~~ ==m== `c`')).toBe(
      '<strong>b</strong> <strong>b</strong> <em>i</em> <em>i</em> <del>s</del> <mark>m</mark> <code>c</code>',
    );
  });

  test('leaves snake_case, lone stars and code contents alone', () => {
    expect(renderInline('snake_case_name 2 * 3 * 4')).toBe('snake_case_name 2 * 3 * 4');
    expect(renderInline('`**x** <b>`')).toBe('<code>**x** &lt;b&gt;</code>');
  });

  test('does not emphasise inside a url', () => {
    expect(renderInline('https://a.dev/a_b_c*d*')).toContain('>https://a.dev/a_b_c*d*</a>');
  });

  test('escapes raw html', () => {
    expect(renderInline('<img src=x onerror=alert(1)> "q"')).toBe(
      '&lt;img src=x onerror=alert(1)&gt; &quot;q&quot;',
    );
  });
});

describe('renderMarkdown', () => {
  test('keeps line breaks inside a paragraph and splits on blank lines', () => {
    expect(renderMarkdown('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
  });

  test('renders headings one level below the page title', () => {
    expect(renderMarkdown('# Top\n### Sub ##')).toBe('<h2>Top</h2><h4>Sub</h4>');
  });

  test('renders bullet, ordered and nested lists', () => {
    expect(renderMarkdown('- a\n- b\n  - c\n\n3. x\n4. y')).toBe(
      '<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul><ol start="3"><li>x</li><li>y</li></ol>',
    );
  });

  test('renders checklists', () => {
    expect(renderMarkdown('- [ ] todo\n- [x] done')).toBe(
      '<ul><li class="task"><input type="checkbox" disabled> todo</li>' +
        '<li class="task"><input type="checkbox" disabled checked> done</li></ul>',
    );
  });

  test('renders quotes, rules and fenced code', () => {
    expect(renderMarkdown('> **q**\n> r\n\n---\n\n```js\n<b>*x*</b>\n```')).toBe(
      '<blockquote><p><strong>q</strong><br>r</p></blockquote><hr>' +
        '<pre><code>&lt;b&gt;*x*&lt;/b&gt;</code></pre>',
    );
  });

  test('a block starts right after a paragraph line', () => {
    expect(renderMarkdown('Steps:\n- one\n- two')).toBe(
      '<p>Steps:</p><ul><li>one</li><li>two</li></ul>',
    );
  });

  test('normalises windows line endings and ignores NUL placeholders in the input', () => {
    expect(renderMarkdown('a\r\nb\u00000\u0000')).toBe('<p>a<br>b0</p>');
  });
});
