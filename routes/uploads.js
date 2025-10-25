const express = require("express");
const router = express.Router();
const multer = require("multer");
const uploadController = require("../controllers/uploads");
const requireAuth = require("../middleware/auth");

// use memory storage so we can process file buffers without writing to disk
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 5, // max 5 files per request
  },
});

// POST /api/ask-with-files - require authentication
router.post(
  "/ask-with-files",
  requireAuth,
  upload.array("files"),
  uploadController.askWithFiles
);

// Test endpoint to check PDF parsing capabilities
router.get("/test-pdf", (req, res) => {
  try {
    require("pdf-parse"); // Test if module loads
    res.json({
      status: "pdf-parse module loaded successfully",
      version: require("pdf-parse/package.json").version,
    });
  } catch (err) {
    res.status(500).json({
      status: "pdf-parse module failed to load",
      error: err.message,
    });
  }
});

module.exports = router;
