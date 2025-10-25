const Message = require("../models/message");

exports.getMessages = async (req, res) => {
  try {
    const { chatId, limit = 100 } = req.query;
    const q = chatId ? { chatId } : {};
    const msgs = await Message.find(q)
      .sort({ createdAt: 1 })
      .limit(parseInt(limit, 10));
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createMessage = async (req, res) => {
  try {
    // require authenticated user
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { role, text, chatId, title } = req.body;
    // Optional: verify chat ownership if chatId provided
    if (chatId) {
      const Chat = require("../models/chat");
      const c = await Chat.findById(chatId);
      if (!c || String(c.userId) !== String(user._id)) {
        return res.status(403).json({ error: "chat not owned by user" });
      }
    }

    const payload = { role, text, chatId, title };
    const msg = new Message(payload);
    await msg.save();
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// get latest message for a chat
exports.getLatestForChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    if (!chatId) return res.status(400).json({ error: "chatId required" });
    const msg = await Message.findOne({ chatId }).sort({ createdAt: -1 });
    res.json(msg || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
