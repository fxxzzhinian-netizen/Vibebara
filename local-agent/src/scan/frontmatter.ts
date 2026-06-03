import yaml from "js-yaml";

/**
 * SKILL.md frontmatter 解析 —— **逐字移植** skill-forge src/utils/yaml.ts::parseFrontmatter，
 * 保证与云端 bridge 的 origin 检测/字段提取口径一致（R1）。
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }
  const frontmatter = (yaml.load(match[1] ?? "") as Record<string, unknown>) ?? {};
  return { frontmatter, body: (match[2] ?? "").trim() };
}

export function parseYaml<T = Record<string, unknown>>(content: string): T {
  return yaml.load(content) as T;
}
