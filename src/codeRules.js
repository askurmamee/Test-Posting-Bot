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
  normalizeChannelType,
};
