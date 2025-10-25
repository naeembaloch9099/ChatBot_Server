const axios = require("axios");

// Default model (v1beta). Allow override with GEMINI_MODEL env var.
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

exports.generate = async (req, res) => {
  const { systemPrompt, conversation } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing API key" });

  const model = DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  console.log("[gemini controller] using model=", model);

  // Build Gemini API context
  // Gemini expects roles: "user" and "model" only. Prepend systemPrompt as first user message.
  const contents = [];
  if (systemPrompt) {
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
  }
  if (Array.isArray(conversation)) {
    for (const msg of conversation) {
      let role = msg.role;
      if (role === "assistant") role = "model";
      if (role === "system") role = "user";
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }
  }

  try {
    const forwardRes = await axios.post(
      endpoint,
      { contents },
      { headers: { "Content-Type": "application/json" } }
    );

    const data = forwardRes.data;
    console.log("[gemini controller] upstream status=", forwardRes.status);
    console.log("[gemini controller] upstream data=", data);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    res.json({ response: text });
  } catch (err) {
    const upstream = err.response?.data ?? err.message;
    console.error("gemini generate error", upstream);
    res
      .status(err.response?.status || 500)
      .json({ error: "Upstream error from Gemini", details: upstream });
  }
};
