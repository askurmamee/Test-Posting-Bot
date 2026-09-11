const CHANNEL_TYPES = {
  casino: "casino",
  "sweepstakes-casino": "casino",
  sweepstakes: "casino",
  freesc: "freesc",
  "free-sc": "freesc",
  free_sc: "freesc",
  free: "freesc",
};

function normalizeChannelType(value) {
  if (!value) {
    return null;
  }

  return CHANNEL_TYPES[String(value).trim().toLowerCase()] ?? null;
}

function isValidCode(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();

  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,49}$/.test(trimmed);
}

function isValidUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseSubmissionParts(value) {
  if (typeof value !== "string") {
    return null;
  }

  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 4) {
    return null;
  }

  const [name, code, link, description] = parts;

  if (!name || name.length > 80 || !isValidCode(code) || !isValidUrl(link)) {
    return null;
  }

  if (!description || description.length > 200) {
    return null;
  }

  return {
    code,
    description,
    link,
    name,
  };
}

function getChannelLabel(type) {
  if (type === "casino") {
    return "Sweepstakes Casino";
  }

  if (type === "freesc") {
    return "Free SC";
  }

  return "Code";
}

module.exports = {
  getChannelLabel,
  isValidCode,
  isValidUrl,
  normalizeChannelType,
  parseSubmissionParts,
};
