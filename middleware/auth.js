const User = require("../models/user");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const COOKIE_NAME = process.env.SESSION_COOKIE || "sid";

// Require authenticated user via JWT access token.
module.exports = async function requireAuth(req, res, next) {
  try {
    let token = null;

    // Prefer cookie
    if (req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
      console.log(
        `[auth middleware] Found token in cookie: ${token.substring(0, 20)}...`
      );
    }

    // Fallback to Authorization header
    if (!token && req.headers && req.headers.authorization) {
      const parts = String(req.headers.authorization).split(" ");
      if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
        token = parts[1];
        console.log(
          `[auth middleware] Found token in Authorization header: ${token.substring(
            0,
            20
          )}...`
        );
      }
    }

    if (!token) {
      console.log(
        `[auth middleware] No token found. Cookies:`,
        Object.keys(req.cookies || {})
      );
      return res.status(401).json({ error: "Unauthorized: missing token" });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Unauthorized: invalid token" });
    }

    const user = await User.findById(payload.uid);
    if (!user)
      return res.status(401).json({ error: "Unauthorized: user not found" });

    req.user = user;
    next();
  } catch (err) {
    console.error("auth middleware error", err);
    res.status(500).json({ error: "Internal error" });
  }
};
