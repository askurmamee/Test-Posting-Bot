function splitLinesIntoMessages(lines, maxLength = 1900) {
  const messages = [];
  let current = "";

  for (const line of lines) {
    if (line.length > maxLength) {
      if (current) {
        messages.push(current);
        current = "";
      }

      for (let start = 0; start < line.length; start += maxLength) {
        messages.push(line.slice(start, start + maxLength));
      }
      continue;
    }

    const next = current ? `${current}\n${line}` : line;

    if (next.length > maxLength) {
      messages.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) {
    messages.push(current);
  }

  return messages;
}

module.exports = {
  splitLinesIntoMessages,
};
