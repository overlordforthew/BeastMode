const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "beastmode-dev-secret";

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

module.exports = { authMiddleware, generateToken, JWT_SECRET };
