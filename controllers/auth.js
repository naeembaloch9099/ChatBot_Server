const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const RefreshToken = require("../models/refreshToken");
const { OAuth2Client } = require("google-auth-library");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const COOKIE_NAME = process.env.SESSION_COOKIE || "sid";
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE || "refresh";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Temporary OTP storage (in production, use Redis or database)
const otpStore = new Map(); // email -> { otp, expiresAt, userData }

// Clean up expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(email);
    }
  }
}, 5 * 60 * 1000);

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
  res.cookie(COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });

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

    // issue tokens
    const accessToken = signAccessToken(user);
    const refreshValue = createRefreshValue();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await RefreshToken.create({
      token: refreshValue,
      user: user._id,
      expiresAt: refreshExpiresAt,
    });

    setAuthCookies(res, accessToken, refreshValue);

    res.json({
      ok: true,
      user: { id: user._id, name: user.name, email: user.email },
      accessToken, // Include token in response for cross-origin deployments
      refreshToken: refreshValue,
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

    const accessToken = signAccessToken(user);
    const refreshValue = createRefreshValue();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await RefreshToken.create({
      token: refreshValue,
      user: user._id,
      expiresAt: refreshExpiresAt,
    });

    setAuthCookies(res, accessToken, refreshValue);

    res.json({
      ok: true,
      user: { id: user._id, name: user.name, email: user.email },
      accessToken, // Include token in response for cross-origin deployments
      refreshToken: refreshValue,
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

    res.clearCookie(COOKIE_NAME);
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

// POST /auth/send-otp
exports.sendOtp = async (req, res) => {
  try {
    const { email, name, password } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email required" });

    // Check if email already exists in database
    const normalized = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalized });
    if (existing) {
      return res.status(409).json({ error: "Email already in database" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[send-otp] Sending OTP ${otp} to ${email}`);

    // Store OTP temporarily (expires in 10 minutes)
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(normalized, {
      otp,
      expiresAt,
      userData: { name, password }, // Store signup data for later
    });

    // Send OTP via email
    const { sendOTPEmail } = require("../utils/email");
    const emailResult = await sendOTPEmail(email, otp);

    if (!emailResult.success) {
      console.error(`[send-otp] ❌ Email sending failed: ${emailResult.error}`);
      // Remove from store if email failed
      otpStore.delete(normalized);
      return res
        .status(500)
        .json({ error: "Failed to send verification email" });
    }

    console.log(`[send-otp] ✅ Email sent successfully to ${email}`);

    // For development, include OTP in response (remove in production)
    res.json({
      ok: true,
      message: "Verification code sent to your email",
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (err) {
    console.error("send-otp error", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /auth/verify-otp
exports.verifyOtp = async (req, res) => {
  const { email, otp, code } = req.body || {};
  const otpCode = otp || code; // Accept both 'otp' and 'code' parameter names

  if (!email || !otpCode) {
    console.log(
      `[verify-otp] ❌ Missing parameters: email=${!!email}, otp/code=${!!otpCode}`
    );
    return res.status(400).json({ error: "Email and OTP required" });
  }

  console.log(`[verify-otp] Verifying OTP ${otpCode} for ${email}`);

  try {
    // Check if user already exists
    const normalized = String(email).toLowerCase().trim();
    const existing = await User.findOne({ email: normalized });
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    // Verify OTP from store
    const storedData = otpStore.get(normalized);
    if (!storedData) {
      console.log(`[verify-otp] ❌ No OTP data found for ${normalized}`);
      return res.status(400).json({
        error: "OTP expired or not found. Please request a new code.",
      });
    }

    if (Date.now() > storedData.expiresAt) {
      console.log(`[verify-otp] ❌ OTP expired for ${normalized}`);
      otpStore.delete(normalized);
      return res
        .status(400)
        .json({ error: "OTP expired. Please request a new code." });
    }

    if (storedData.otp !== otpCode.trim()) {
      console.log(
        `[verify-otp] ❌ OTP mismatch for ${normalized}. Expected: ${
          storedData.otp
        }, Got: ${otpCode.trim()}`
      );
      return res.status(400).json({ error: "Invalid OTP code." });
    }

    console.log(`[verify-otp] ✅ OTP verified successfully for ${normalized}`);

    // OTP verified! Create user with stored data
    const { userData } = storedData;
    if (userData && userData.name && userData.password) {
      const passwordHash = await bcrypt.hash(userData.password, 12);
      const user = await User.create({
        name: String(userData.name).trim(),
        email: normalized,
        passwordHash,
      });

      // Clean up OTP from store
      otpStore.delete(normalized);

      // Send welcome email to new email signup users
      const { sendWelcomeEmail } = require("../utils/email");
      sendWelcomeEmail(email, userData.name).catch((err) => {
        console.error(`[verify-otp] Failed to send welcome email:`, err);
        // Don't block the signup if email fails
      });

      // Issue tokens
      const accessToken = signAccessToken(user);
      const refreshValue = createRefreshValue();
      const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
      await RefreshToken.create({
        token: refreshValue,
        user: user._id,
        expiresAt: refreshExpiresAt,
      });

      setAuthCookies(res, accessToken, refreshValue);

      res.json({
        ok: true,
        user: { id: user._id, name: user.name, email: user.email },
      });
    } else {
      // Missing user data - this shouldn't happen if OTP was requested properly
      otpStore.delete(normalized);
      res.status(400).json({
        error: "Invalid signup data. Please start registration again.",
      });
    }
  } catch (err) {
    console.error("verify-otp error", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// POST /auth/google - Google OAuth login
exports.googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential required" });
    }

    if (!GOOGLE_CLIENT_ID) {
      console.error("[google-auth] GOOGLE_CLIENT_ID not configured");
      return res
        .status(500)
        .json({ error: "Google OAuth not configured on server" });
    }

    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    console.log(`[google-auth] Verified Google user: ${email}`);

    // Check if user exists
    const normalized = String(email).toLowerCase().trim();
    let user = await User.findOne({ email: normalized });

    if (!user) {
      // User doesn't exist - require signup first
      console.log(`[google-auth] User not found: ${email}`);
      return res.status(403).json({
        error: "Please sign up first",
        needsSignup: true,
      });
    }

    // Update existing user with Google info if not set
    if (!user.googleId) {
      user.googleId = googleId;
      user.profilePicture = picture || user.profilePicture;
      await user.save();
    }

    // Issue tokens
    const accessToken = signAccessToken(user);
    const refreshValue = createRefreshValue();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await RefreshToken.create({
      token: refreshValue,
      user: user._id,
      expiresAt: refreshExpiresAt,
    });

    setAuthCookies(res, accessToken, refreshValue);

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.profilePicture,
      },
      accessToken,
      refreshToken: refreshValue,
    });
  } catch (err) {
    console.error("[google-auth] Error:", err);
    res.status(401).json({ error: "Invalid Google token" });
  }
};

// POST /auth/google-signup - Google OAuth signup (creates new account)
exports.googleSignup = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential required" });
    }

    if (!GOOGLE_CLIENT_ID) {
      console.error("[google-signup] GOOGLE_CLIENT_ID not configured");
      return res
        .status(500)
        .json({ error: "Google OAuth not configured on server" });
    }

    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    console.log(`[google-signup] Verified Google user: ${email}`);

    // Check if user already exists
    const normalized = String(email).toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalized });

    if (existingUser) {
      return res.status(409).json({
        error: "Email already in use. Please sign in instead.",
        shouldLogin: true,
      });
    }

    // Create new user
    console.log(`[google-signup] Creating new user for ${email}`);
    const user = await User.create({
      name: name || "Google User",
      email: normalized,
      googleId,
      profilePicture: picture,
      passwordHash: await bcrypt.hash(
        crypto.randomBytes(32).toString("hex"),
        12
      ), // Random password (not used for Google accounts)
    });

    // Send welcome email to new Google users
    const { sendWelcomeEmail } = require("../utils/email");
    sendWelcomeEmail(email, name).catch((err) => {
      console.error(`[google-signup] Failed to send welcome email:`, err);
      // Don't block the signup if email fails
    });

    // Issue tokens
    const accessToken = signAccessToken(user);
    const refreshValue = createRefreshValue();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await RefreshToken.create({
      token: refreshValue,
      user: user._id,
      expiresAt: refreshExpiresAt,
    });

    setAuthCookies(res, accessToken, refreshValue);

    res.json({
      ok: true,
      isNewUser: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.profilePicture,
      },
      accessToken,
      refreshToken: refreshValue,
    });
  } catch (err) {
    console.error("[google-signup] Error:", err);
    res.status(500).json({ error: "Failed to sign up with Google" });
  }
};

// PUT /auth/profile - Update user profile
exports.updateProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const { name } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update name if provided
    if (name && name.trim()) {
      user.name = name.trim();
    }

    // Update profile picture if uploaded
    if (req.file) {
      // In production, you would upload to cloud storage (AWS S3, Cloudinary, etc.)
      // For now, we'll store the base64 data
      const base64Image = `data:${
        req.file.mimetype
      };base64,${req.file.buffer.toString("base64")}`;
      user.profilePicture = base64Image;
    }

    await user.save();

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (err) {
    console.error("[update-profile] Error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

// DELETE /auth/account - Delete user account
exports.deleteAccount = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const userId = req.user._id;

    // Delete user's chats and messages
    const Chat = require("../models/chat");
    const Message = require("../models/message");

    const userChats = await Chat.find({ user: userId });
    const chatIds = userChats.map((chat) => chat._id);

    // Delete all messages in user's chats
    await Message.deleteMany({ chat: { $in: chatIds } });

    // Delete all user's chats
    await Chat.deleteMany({ user: userId });

    // Delete refresh tokens
    await RefreshToken.deleteMany({ user: userId });

    // Delete user account
    await User.findByIdAndDelete(userId);

    // Clear cookies
    res.clearCookie(COOKIE_NAME);
    res.clearCookie(REFRESH_COOKIE_NAME);

    res.json({
      ok: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    console.error("[delete-account] Error:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
};
