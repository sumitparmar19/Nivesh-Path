// JWT middleware: requireAuth rejects anonymous calls with 401; optionalAuth only reads the token.
// Every portfolio, trade and AI route uses requireAuth so each user only ever sees their own data.
const jwt = require("jsonwebtoken");
const { config } = require("../config");

function readUser(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const decoded = jwt.verify(header.slice(7), config.jwtSecret);
  const id = decoded.sub || decoded.userId || decoded.id;
  if (!id) throw new Error("Token has no subject");
  return { id: String(id), email: decoded.email };
}

function requireAuth(req, res, next) {
  try {
    const user = readUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function optionalAuth(req, res, next) {
  try {
    const user = readUser(req);
    if (user) req.user = user;
  } catch (err) {
    // A bad token on a public route is ignored; protected routes still reject it.
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
