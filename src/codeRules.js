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

function isValidName(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;
}

function isValidDescription(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 200;
}

function parseCodeSubmission(value) {
  if (typeof value !== "string") {
    return null;
  }

  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const [name, code, link] = parts;

  if (!isValidName(name) || !isValidCode(code)) {
    return null;
  }

  if (link && !isValidUrl(link)) {
    return null;
  }

  return {
    code,
    link: link ?? null,
    name,
  };
}

function parseReferralSubmission(value) {
  if (typeof value !== "string") {
    return null;
  }

  const parts = value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const [name, link, description] = parts;

  if (!isValidName(name) || !isValidUrl(link)) {
    return null;
  }

  if (description && !isValidDescription(description)) {
    return null;
  }

  return {
    description: description ?? null,
    link,
    name,
  };
}

module.exports = {
  isValidCode,
  isValidDescription,
  isValidName,
  isValidUrl,
  parseCodeSubmission,
  parseReferralSubmission,
};
