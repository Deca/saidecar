export const inlineMarkdownPatterns = {
  code: /`([^`\n]+)`/g,
  link: /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
  bold: /\*\*([^*\n]+)\*\*/g,
  underlineBold: /__([^_\n]+)__/g,
  emphasis: /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
  underlineEmphasis: /(?<!_)_([^_\n]+)_(?!_)/g,
};

export const blockPatterns = {
  heading: /^(#{1,6})\s+(.+?)\s*#*$/,
  blockquote: /^(\s*)>\s?(.*)$/,
  task: /^(\s*)-\s+\[([ xX])\]\s+(.+)$/,
  unordered: /^(\s*)([-*+])\s+(.+)$/,
  ordered: /^(\s*)(\d+)\.\s+(.+)$/,
  tableSeparator: /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/,
  fence: /^(\s*)(`{3,}|~{3,})(.*)$/,
};

export function stripInlineMarkdown(text) {
  return String(text || "")
    .replace(inlineMarkdownPatterns.code, "$1")
    .replace(inlineMarkdownPatterns.link, "$1 ($2)")
    .replace(inlineMarkdownPatterns.bold, "$1")
    .replace(inlineMarkdownPatterns.underlineBold, "$1")
    .replace(inlineMarkdownPatterns.emphasis, "$1")
    .replace(inlineMarkdownPatterns.underlineEmphasis, "$1");
}