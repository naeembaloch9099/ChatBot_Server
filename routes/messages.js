const express = require("express");
const router = express.Router();
const messagesController = require("../controllers/messages");
const requireAuth = require("../middleware/auth");

router.get("/", requireAuth, messagesController.getMessages);
router.post("/", requireAuth, messagesController.createMessage);
router.get("/latest/:chatId", requireAuth, messagesController.getLatestForChat);

module.exports = router;
