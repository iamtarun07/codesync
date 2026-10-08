import { describe, expect, it } from 'vitest';
import { adaptJavaEntry } from '../services/javaEntry';

describe('adaptJavaEntry', () => {
  it('leaves a program with a Main class alone', () => {
    const source = 'public class Main { public static void main(String[] a) {} }';
    expect(adaptJavaEntry(source)).toBe(source);
  });

  it('delegates to a differently named public entry class', () => {
    const out = adaptJavaEntry(
      'public class Solution {\n  public static void main(String[] a) { System.out.println(1); }\n}',
    );
    expect(out).not.toMatch(/public\s+class\s+Solution/);
    expect(out).toContain('class Solution {');
    expect(out).toContain('class Main {');
    expect(out).toContain('Solution.main(args);');
  });

  it('keeps final/abstract modifiers and drops the package line', () => {
    const out = adaptJavaEntry('package com.example;\npublic final class App { }');
    expect(out).not.toContain('package');
    expect(out).toContain('final class App');
    expect(out).toContain('App.main(args);');
  });

  it('falls back to the first class when none is public', () => {
    expect(adaptJavaEntry('class Runner { }')).toContain('Runner.main(args);');
  });
});
