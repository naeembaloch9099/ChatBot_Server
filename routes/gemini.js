const express = require("express");
const router = express.Router();
const geminiController = require("../controllers/gemini");

router.post("/", geminiController.generate);

module.exports = router;
