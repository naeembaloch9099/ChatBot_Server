const express = require("express");
const router = express.Router();
const chats = require("../controllers/chats");
const requireAuth = require("../middleware/auth");

router.get("/", requireAuth, chats.listChats);
router.post("/", requireAuth, chats.createChat);
router.delete("/:id", requireAuth, chats.deleteChat);
router.patch("/:id", requireAuth, chats.updateChat);

module.exports = router;
