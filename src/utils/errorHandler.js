function formatError(message, details) {
  const out = { error: message };
  if (details) out.details = details;
  return out;
}

module.exports = {
  formatError
};
