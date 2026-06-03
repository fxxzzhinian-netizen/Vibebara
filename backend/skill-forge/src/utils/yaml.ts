import yaml from "js-yaml";

export function parseYaml<T = Record<string, unknown>>(content: string): T {
  return yaml.load(content) as T;
}

export function dumpYaml(data: unknown): string {
  return yaml.dump(data, { lineWidth: -1, noRefs: true });
}

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }
  const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
  return { frontmatter, body: match[2].trim() };
}

export function buildFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  return `---\n${dumpYaml(data).trim()}\n---\n\n${body}\n`;
}
