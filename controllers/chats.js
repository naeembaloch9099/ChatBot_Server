const Chat = require("../models/chat");

exports.createChat = async (req, res) => {
  try {
    const user = req.user;
    const chat = new Chat({
      userId: user._id,
      title: req.body.title || "New Chat",
    });
    await chat.save();
    res.json(chat);
  } catch (err) {
    console.error("createChat error", err);
    res.status(500).json({ error: err.message });
  }
};

exports.listChats = async (req, res) => {
  try {
    const user = req.user;
    const chats = await Chat.find({ userId: user._id }).sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    console.error("listChats error", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteChat = async (req, res) => {
  try {
    const user = req.user;
    const id = req.params.id;
    const chat = await Chat.findOne({ _id: id, userId: user._id });
    if (!chat) return res.status(404).json({ error: "not found" });
    await chat.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteChat error", err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateChat = async (req, res) => {
  try {
    const user = req.user;
    const id = req.params.id;
    const { title } = req.body;
    const chat = await Chat.findOne({ _id: id, userId: user._id });
    if (!chat) return res.status(404).json({ error: "not found" });
    if (typeof title === "string") chat.title = title;
    await chat.save();
    res.json(chat);
  } catch (err) {
    console.error("updateChat error", err);
    res.status(500).json({ error: err.message });
  }
};
