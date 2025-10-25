const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

// Extract text from PDF buffer using pdf-parse
async function extractTextFromPdf(buffer) {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error("Empty or invalid buffer");
    }

    console.log(`[PDF] Attempting to parse ${buffer.length} bytes`);
    console.log(`[PDF] pdf-parse function type:`, typeof pdfParse);

    // Check if buffer looks like a PDF (should start with %PDF)
    const header = buffer.slice(0, 4).toString();
    console.log(`[PDF] Buffer header: ${header}`);

    if (!header.startsWith("%PDF")) {
      throw new Error(
        "File does not appear to be a valid PDF (missing %PDF header)"
      );
    }

    // Parse PDF using pdf-parse function
    const data = await pdfParse(buffer);
    const extractedLength = data?.text?.length || 0;

    console.log(
      `[PDF] Successfully parsed. Pages: ${
        data?.numpages || 0
      }, Characters: ${extractedLength}`
    );

    if (extractedLength === 0) {
      console.warn(
        "[PDF] No text extracted - this might be a scanned PDF or image-only PDF"
      );
      return "This appears to be a scanned PDF or image-based PDF. No text could be extracted automatically.";
    }

    return data.text;
  } catch (err) {
    console.error("PDF parse failed:", err);
    throw new Error(`PDF parsing failed: ${err.message}`);
  }
}

// Extract text from image using OCR.Space, fallback to tesseract.js if needed
require("dotenv").config();
const fetch = require("node-fetch");
async function extractText(buffer, filename) {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    console.warn(
      "[OCR] No OCR.Space API key found in .env, using tesseract.js fallback."
    );
    return await tesseractOcr(buffer);
  }
  console.log(
    "[OCR] Using OCR.Space API key:",
    apiKey ? apiKey.slice(0, 6) + "..." : "none"
  );
  try {
    const FormData = require("form-data");
    const form = new FormData();
    form.append("apikey", apiKey); // must be lowercase
    form.append("file", buffer, { filename: filename });
    form.append("language", "eng");
    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });
    const data = await res.json();
    console.log("[OCR.Space API response]", JSON.stringify(data, null, 2));
    if (data && data.ParsedResults && data.ParsedResults[0]) {
      const text = data.ParsedResults.map((p) => p.ParsedText).join("\n");
      if (text && text.trim().length > 0) return text;
    }
    if (data && data.ErrorMessage) {
      console.warn("[OCR.Space Error]", data.ErrorMessage);
    }
    // fallback to tesseract.js if no text or error
    return await tesseractOcr(buffer);
  } catch (err) {
    console.warn("[OCR] OCR.Space failed, falling back to tesseract.js", err);
    return await tesseractOcr(buffer);
  }
}

// Local OCR fallback using tesseract.js
async function tesseractOcr(buffer) {
  try {
    const Tesseract = require("tesseract.js");
    const {
      data: { text },
    } = await Tesseract.recognize(buffer, "eng");
    console.log(
      "[Tesseract.js OCR result]",
      text ? text.slice(0, 100) : "(empty)"
    );
    return text || "";
  } catch (err) {
    console.warn("[Tesseract.js OCR failed]", err);
    return "";
  }
}

// Main handler: accepts multipart files and a 'question' field. Extracts text from supported files,
// builds a combined context and returns an AI answer (via Gemini) or the extracted text.
exports.askWithFiles = async (req, res) => {
  try {
    const files = req.files || [];
    const question = req.body.question || "";
    const parts = [];

    console.log(
      `[askWithFiles] Processing ${files.length} files for user ${req.user._id}`
    );

    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    for (const f of files) {
      const name = f.originalname || f.filename || "file";
      const ext = (name.split(".").pop() || "").toLowerCase();
      const size = f.buffer ? f.buffer.length : 0;

      console.log(
        `[askWithFiles] Processing file: ${name} (${ext}, ${size} bytes)`
      );

      let text = "";
      let extractionError = null;

      try {
        if (ext === "pdf") {
          text = await extractTextFromPdf(f.buffer);
          console.log(
            `[askWithFiles] PDF extracted ${text.length} characters from ${name}`
          );
        } else if (ext === "docx") {
          // DOCX extraction using mammoth
          const result = await mammoth.extractRawText({ buffer: f.buffer });
          text = result.value || "";
          console.log(
            `[askWithFiles] DOCX extracted ${text.length} characters from ${name}`
          );
        } else if (ext === "xlsx") {
          // XLSX extraction using xlsx
          const workbook = XLSX.read(f.buffer, { type: "buffer" });
          text = workbook.SheetNames.map((sheet) => {
            const ws = workbook.Sheets[sheet];
            return XLSX.utils.sheet_to_csv(ws);
          }).join("\n");
          console.log(
            `[askWithFiles] XLSX extracted ${text.length} characters from ${name}`
          );
        } else if (ext === "txt" || ext === "html") {
          if (!f.buffer || f.buffer.length === 0) {
            throw new Error("Empty or invalid buffer for text file");
          }
          text = f.buffer.toString("utf8");
          console.log(
            `[askWithFiles] Text file extracted ${text.length} characters from ${name}`
          );
        } else if (
          ["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp"].includes(ext)
        ) {
          // Use OCR.Space with fallback to tesseract.js
          text = await extractText(f.buffer, name);
          console.log(
            `[askWithFiles] OCR extracted ${text.length} characters from ${name}`
          );
        } else {
          // unknown binary file - skip text extraction
          text = "";
          console.log(
            `[askWithFiles] Unsupported file type: ${ext} for ${name}`
          );
        }
      } catch (err) {
        console.error(`[askWithFiles] Error extracting from ${name}:`, err);
        extractionError = err.message;
        text = "";
      }

      parts.push({
        name,
        ext,
        text: text || "",
        size,
        error: extractionError,
      });
    }

    // Build a short context from extracted texts (limit to avoid huge payloads)
    const combined = parts
      .filter((p) => p.text && p.text.trim().length > 0)
      .map(
        (p) => `--- ${p.name} (${p.ext}) ---\n${(p.text || "").slice(0, 20000)}`
      )
      .join("\n\n");

    console.log(
      `[askWithFiles] Combined text length: ${combined.length} characters`
    );

    const response = {
      extracted: combined,
      answer: null,
      files: parts.map((p) => ({
        name: p.name,
        type: p.ext,
        size: p.size,
        textLength: p.text ? p.text.length : 0,
        error: p.error || null,
      })),
    };

    // If there's no Gemini key or no files text, just return the combined text for client-side handling
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.log("[askWithFiles] No Gemini API key configured");
      return res.json(response);
    }

    if (!combined.trim()) {
      console.log("[askWithFiles] No text extracted from any files");
      const errorDetails = parts
        .map((p) => `${p.name}: ${p.error || "Unknown error"}`)
        .join("; ");
      response.error = `No text could be extracted from the uploaded files. Details: ${errorDetails}`;
      response.answer = `I couldn't extract any readable text from the uploaded files. This might be because:

1. **Scanned PDF**: The PDF contains images/scans rather than selectable text
2. **Encrypted PDF**: The PDF is password protected or encrypted
3. **Corrupted file**: The file may be damaged
4. **Unsupported format**: The file format isn't supported for text extraction

File analysis:
${parts
  .map(
    (p) =>
      `• ${p.name} (${p.type}, ${(p.size / 1024).toFixed(1)}KB): ${
        p.error || "No text found"
      }`
  )
  .join("\n")}

For scanned PDFs, you might need to use OCR (Optical Character Recognition) tools to extract the text first.`;
      return res.json(response);
    }

    // Build a prompt to ask Gemini to answer the question given the extracted context
    const prompt = `You are given the following extracted text from uploaded files:\n${combined}\n\nAnswer the question succinctly:\n${question}`;

    // Call Gemini (same as controllers/gemini.js)
    const axios = require("axios");
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
    const forwardRes = await axios.post(
      endpoint,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json" } }
    );
    const data = forwardRes.data;
    const textResp = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    response.answer = textResp;
    console.log(
      `[askWithFiles] Generated answer length: ${
        textResp ? textResp.length : 0
      } characters`
    );
    return res.json(response);
  } catch (err) {
    console.error("askWithFiles error", err);
    return res
      .status(500)
      .json({ error: "Failed to process files", details: err.message });
  }
};
