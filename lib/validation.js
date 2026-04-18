const { ZodError } = require("zod");

function firstIssueMessage(error) {
  if (!(error instanceof ZodError) || error.issues.length === 0) {
    return "Invalid request";
  }

  const issue = error.issues[0];
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body || {});
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: firstIssueMessage(error) });
      }
      return next(error);
    }
  };
}

module.exports = { validateBody };
