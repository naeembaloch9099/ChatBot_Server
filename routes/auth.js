const express = require("express");
const router = express.Router();
const auth = require("../controllers/auth");
const requireAuth = require("../middleware/auth");
const multer = require("multer");

// Configure multer for memory storage (file will be in req.file.buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

router.post("/register", auth.register);
router.post("/send-otp", auth.sendOtp);
router.post("/verify-otp", auth.verifyOtp);
router.post("/login", auth.login);
router.post("/logout", auth.logout);
router.post("/refresh", auth.refresh);
router.post("/google", auth.googleAuth);
router.get("/me", requireAuth, auth.me);
router.put(
  "/profile",
  requireAuth,
  upload.single("profilePicture"),
  auth.updateProfile
);
router.delete("/account", requireAuth, auth.deleteAccount);

module.exports = router;
