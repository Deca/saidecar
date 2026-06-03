export function wrapText(text, width) {
  const lines = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = "";

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    for (const word of words) {
      if (!line) {
        line = word;
      } else if ((line + " " + word).length <= width) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }

    if (line) {
      lines.push(line);
    }
  }

  return lines;
}