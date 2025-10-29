const express = require("express");
const router = express.Router();
const auth = require("../controllers/auth");
const requireAuth = require("../middleware/auth");

router.post("/register", auth.register);
router.post("/send-otp", auth.sendOtp);
router.post("/verify-otp", auth.verifyOtp);
router.post("/login", auth.login);
router.post("/logout", auth.logout);
router.post("/refresh", auth.refresh);
router.post("/google", auth.googleAuth);
router.get("/me", requireAuth, auth.me);

module.exports = router;
