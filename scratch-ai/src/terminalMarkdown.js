import chalk from "chalk";

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
    .replace(/`([^`\n]+)`/g, (_, code) => theme.code(code))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      return `${theme.link(label)} ${theme.marker(`(${url})`)}`;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, (_, content) => theme.strong(content))
    .replace(/__([^_\n]+)__/g, (_, content) => theme.strong(content))
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, content) => theme.emphasis(content))
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, (_, content) => theme.emphasis(content));
}

function renderTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
    ? theme.marker(line)
    : null;
}

function renderMarkdownLine(line) {
  const tableSeparator = renderTableSeparator(line);
  if (tableSeparator) {
    return tableSeparator;
  }

  const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
  if (heading) {
    return theme.heading(renderInlineMarkdown(heading[2]));
  }

  const blockquote = /^(\s*)>\s?(.*)$/.exec(line);
  if (blockquote) {
    return `${blockquote[1]}${theme.quote("|")} ${chalk.hex("#D6F5FF")(renderInlineMarkdown(blockquote[2]))}`;
  }

  const task = /^(\s*)-\s+\[([ xX])\]\s+(.+)$/.exec(line);
  if (task) {
    const box = task[2].trim() ? "[x]" : "[ ]";
    return `${task[1]}${theme.marker(box)} ${renderInlineMarkdown(task[3])}`;
  }

  const unordered = /^(\s*)([-*+])\s+(.+)$/.exec(line);
  if (unordered) {
    return `${unordered[1]}${theme.marker("-")} ${renderInlineMarkdown(unordered[3])}`;
  }

  const ordered = /^(\s*)(\d+)\.\s+(.+)$/.exec(line);
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
    const fence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
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
