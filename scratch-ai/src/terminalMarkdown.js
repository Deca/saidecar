import chalk from "chalk";
import { blockPatterns, inlineMarkdownPatterns } from "./markdownUtils.js";

const theme = {
  heading: chalk.hex("#C084FC").bold,
  marker: chalk.hex("#8A8F98"),
  quote: chalk.hex("#67E8F9"),
  code: chalk.hex("#FDE68A"),
  link: chalk.hex("#60A5FA").underline,
  strong: chalk.bold,
  emphasis: chalk.italic,
};

function renderInlineMarkdown(text) {
  return text
    .replace(inlineMarkdownPatterns.code, (_, code) => theme.code(code))
    .replace(inlineMarkdownPatterns.link, (_, label, url) => {
      return `${theme.link(label)} ${theme.marker(`(${url})`)}`;
    })
    .replace(inlineMarkdownPatterns.bold, (_, content) => theme.strong(content))
    .replace(inlineMarkdownPatterns.underlineBold, (_, content) => theme.strong(content))
    .replace(inlineMarkdownPatterns.emphasis, (_, content) => theme.emphasis(content))
    .replace(inlineMarkdownPatterns.underlineEmphasis, (_, content) => theme.emphasis(content));
}

function renderTableSeparator(line) {
  return blockPatterns.tableSeparator.test(line)
    ? theme.marker(line)
    : null;
}

function renderMarkdownLine(line) {
  const tableSeparator = renderTableSeparator(line);
  if (tableSeparator) {
    return tableSeparator;
  }

  if (blockPatterns.horizontalRule.test(line)) {
    return theme.marker("─".repeat(Math.max(3, line.trim().length)));
  }

  const heading = blockPatterns.heading.exec(line);
  if (heading) {
    return theme.heading(renderInlineMarkdown(heading[2]));
  }

  const blockquote = blockPatterns.blockquote.exec(line);
  if (blockquote) {
    return `${blockquote[1]}${theme.quote("|")} ${chalk.hex("#D6F5FF")(renderInlineMarkdown(blockquote[2]))}`;
  }

  const task = blockPatterns.task.exec(line);
  if (task) {
    const box = task[2].trim() ? "[x]" : "[ ]";
    return `${task[1]}${theme.marker(box)} ${renderInlineMarkdown(task[3])}`;
  }

  const unordered = blockPatterns.unordered.exec(line);
  if (unordered) {
    return `${unordered[1]}${theme.marker("-")} ${renderInlineMarkdown(unordered[3])}`;
  }

  const ordered = blockPatterns.ordered.exec(line);
  if (ordered) {
    return `${ordered[1]}${theme.marker(`${ordered[2]}.`)} ${renderInlineMarkdown(ordered[3])}`;
  }

  return renderInlineMarkdown(line);
}

export function renderMarkdownForTerminal(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const rendered = [];
  let inFence = false;

  for (const line of lines) {
    const fence = blockPatterns.fence.exec(line);
    if (fence) {
      if (inFence) {
        inFence = false;
      } else {
        inFence = true;
        const language = fence[3].trim();
        rendered.push(language ? theme.marker(`${fence[1]}${language}`) : theme.marker(`${fence[1]}code`));
      }
      continue;
    }

    if (inFence) {
      rendered.push(theme.code(line));
      continue;
    }

    rendered.push(renderMarkdownLine(line));
  }

  return rendered.join("\n");
}
