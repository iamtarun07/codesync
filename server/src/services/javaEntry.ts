/**
 * Judge0 compiles Java as `Main.java` and runs `java Main`, so a program whose
 * entry class is `public class Solution` fails to compile there while it runs
 * fine locally. This rewrites such a program to fit: the `public` modifier is
 * dropped from the entry class (a non-public class may live in Main.java) and
 * a `Main` class delegating to it is appended. A `package` line is removed
 * because `java Main` only finds classes in the default package.
 *
 * ponytail: regex, not a parser — `class X` inside a comment or string can
 * mislead it. Good enough for single-file exercises.
 */
export function adaptJavaEntry(source: string): string {
  const withoutPackage = source.replace(/^\s*package\s+[\w.]+\s*;/m, '');
  if (/\bclass\s+Main\b/.test(withoutPackage)) return withoutPackage;

  const publicClass = /\bpublic\s+((?:final\s+|abstract\s+)*)class\s+(\w+)/.exec(withoutPackage);
  const entry = publicClass?.[2] ?? /\bclass\s+(\w+)/.exec(withoutPackage)?.[1];
  if (!entry) return withoutPackage;

  const body = publicClass
    ? withoutPackage.replace(publicClass[0], `${publicClass[1]}class ${entry}`)
    : withoutPackage;

  return (
    `${body}\n\nclass Main {\n` +
    `  public static void main(String[] args) throws Exception {\n` +
    `    ${entry}.main(args);\n` +
    `  }\n}\n`
  );
}
