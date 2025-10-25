// POST /auth/send-otp
exports.sendOtp = async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });
  // Simulate OTP generation
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // In production, send email here
  console.log(`[send-otp] Sending OTP ${otp} to ${email}`);
  res.json({ ok: true, otp });
};
const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/refreshToken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const COOKIE_NAME = process.env.SESSION_COOKIE || "sid";
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE || "refresh";

const ACCESS_EXPIRES = process.env.ACCESS_EXPIRES || "30m"; // jwt expiresIn
const ACCESS_COOKIE_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

const COOKIE_SECURE = process.env.NODE_ENV === "production";

function signAccessToken(user) {
  return jwt.sign({ uid: user._id }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function createRefreshValue() {
  return crypto.randomBytes(48).toString("hex");
}

function setAuthCookies(res, accessToken, refreshValue) {
  if (refreshValue) {
    res.cookie(REFRESH_COOKIE_NAME, refreshValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
      maxAge: REFRESH_TTL_MS,
    });
  }
}

// POST /auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ error: "name, email and password required" });

    const normalized = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalized });
    if (existing)
      return res.status(409).json({ error: "email already in use" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: String(name).trim(),
      email: normalized,
      passwordHash,
    });

    // issue only refresh token
    const refreshValue = createRefreshValue();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await RefreshToken.create({
      token: refreshValue,
      user: user._id,
      expiresAt: refreshExpiresAt,
    });

    setAuthCookies(res, null, refreshValue);

    res.json({
      ok: true,
      user: { id: user._id, name: user.name, email: user.email },
      refreshToken: refreshValue,
      expiresAt: refreshExpiresAt,
    });
  } catch (err) {
    console.error("register error", err);
    next(err);
  }
};

// POST /auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email and password required" });

    const normalized = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalized });
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    // issue only refresh token
    const refreshValue = createRefreshValue();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await RefreshToken.create({
      token: refreshValue,
      user: user._id,
      expiresAt: refreshExpiresAt,
    });

    setAuthCookies(res, null, refreshValue);

    res.json({
      ok: true,
      user: { id: user._id, name: user.name, email: user.email },
      refreshToken: refreshValue,
      expiresAt: refreshExpiresAt,
    });
  } catch (err) {
    console.error("login error", err);
    next(err);
  }
};

// POST /auth/logout
exports.logout = async (req, res, next) => {
  try {
    try {
      const refreshValue = req.cookies && req.cookies[REFRESH_COOKIE_NAME];
      if (refreshValue)
        await RefreshToken.deleteOne({ token: refreshValue }).catch(() => {});
    } catch {
      // ignore
    }

    res.clearCookie(REFRESH_COOKIE_NAME);
    res.json({ ok: true });
  } catch (err) {
    console.error("logout error", err);
    next(err);
  }
};

// POST /auth/refresh - rotate refresh token and return new access token
exports.refresh = async (req, res, next) => {
  try {
    const refreshValue = req.cookies && req.cookies[REFRESH_COOKIE_NAME];
    if (!refreshValue)
      return res.status(401).json({ error: "missing refresh token" });

    const stored = await RefreshToken.findOne({ token: refreshValue });
    if (!stored)
      return res.status(401).json({ error: "invalid refresh token" });
    if (stored.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: stored._id }).catch(() => {});
      return res.status(401).json({ error: "refresh token expired" });
    }

    const user = await User.findById(stored.user);
    if (!user) return res.status(401).json({ error: "user not found" });

    // rotate: delete old refresh token and create a new one
    await RefreshToken.deleteOne({ _id: stored._id }).catch(() => {});
    const newRefresh = createRefreshValue();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await RefreshToken.create({
      token: newRefresh,
      user: user._id,
      expiresAt: refreshExpiresAt,
    });

    const accessToken = signAccessToken(user);
    setAuthCookies(res, accessToken, newRefresh);

    res.json({ ok: true });
  } catch (err) {
    console.error("refresh error", err);
    next(err);
  }
};

// GET /auth/me
exports.me = async (req, res, next) => {
  try {
    if (!req.user) return res.status(401).json({ error: "unauthenticated" });
    const u = req.user;
    res.json({ ok: true, user: { id: u._id, name: u.name, email: u.email } });
  } catch (err) {
    next(err);
  }
};
