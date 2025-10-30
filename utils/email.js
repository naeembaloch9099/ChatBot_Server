const nodemailer = require("nodemailer");

// Validate .env email configuration
const validateEmailConfig = () => {
  const requiredVars = ["SMTP_USER", "SMTP_PASS"];
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.error(
      `[Email] ❌ Missing required .env variables: ${missing.join(", ")}`
    );
    console.error(`[Email] 🔧 Please add these to your .env file:`);
    missing.forEach((varName) => {
      if (varName === "SMTP_USER") {
        console.error(`[Email] ${varName}=your-gmail@gmail.com`);
      } else if (varName === "SMTP_PASS") {
        console.error(`[Email] ${varName}=your-16-character-app-password`);
      }
    });
    return false;
  }

  // Validate Gmail app password format (16 characters)
  const appPassword = process.env.SMTP_PASS;
  if (appPassword && appPassword.length !== 16) {
    console.warn(
      `[Email] ⚠️  Gmail App Password should be 16 characters, got ${appPassword.length}`
    );
    console.warn(
      `[Email] 💡 Generate app password at: https://myaccount.google.com/apppasswords`
    );
  }

  console.log(`[Email] ✅ .env configuration validated successfully`);
  console.log(`[Email] 📧 Using SMTP_USER: ${process.env.SMTP_USER}`);
  console.log(
    `[Email] 🔐 App password length: ${
      appPassword ? appPassword.length : 0
    } characters`
  );
  return true;
};

// Create transporter using Gmail SMTP with app password
const createTransporter = () => {
  // Validate config before creating transporter
  if (!validateEmailConfig()) {
    throw new Error("Invalid email configuration in .env file");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true, // true for 465 (SSL), false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Your Gemini Chatbot Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">🤖 Gemini Chatbot</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">AI-Powered Conversations</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin: 20px 0; text-align: center;">
            <h2 style="color: #333; margin: 0 0 15px 0;">Verification Code</h2>
            <p style="color: #666; margin: 0 0 20px 0;">Enter this code to complete your registration:</p>
            <div style="background: white; padding: 20px; border-radius: 8px; border: 2px dashed #667eea; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${otp}</span>
            </div>
            <p style="color: #999; margin: 20px 0 0 0; font-size: 14px;">This code expires in 10 minutes</p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #666; font-size: 14px;">
            <p>If you didn't request this code, please ignore this email.</p>
            <p style="margin: 5px 0 0 0;">© 2025 Gemini Chatbot. All rights reserved.</p>
          </div>
        </div>
      `,
      text: `
Your Gemini Chatbot Verification Code

Enter this code to complete your registration: ${otp}

This code expires in 10 minutes.

If you didn't request this code, please ignore this email.

© 2025 Gemini Chatbot. All rights reserved.
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[Email] ✅ OTP sent successfully to ${email}. Message ID: ${info.messageId}`
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email] ❌ Failed to send OTP to ${email}:`, error.message);

    // Specific error handling for common Gmail/app password issues
    if (error.code === "EAUTH" || error.responseCode === 535) {
      console.error(`[Email] 🔐 AUTHENTICATION ERROR - Invalid app password!`);
      console.error(`[Email] 💡 Common solutions:`);
      console.error(
        `[Email]    1. Check SMTP_USER in .env (should be your Gmail address)`
      );
      console.error(
        `[Email]    2. Check SMTP_PASS in .env (should be 16-character app password)`
      );
      console.error(
        `[Email]    3. Generate new app password: https://myaccount.google.com/apppasswords`
      );
      console.error(
        `[Email]    4. Make sure 2-factor authentication is enabled on Gmail`
      );
      console.error(
        `[Email] � Current SMTP_USER: ${process.env.SMTP_USER || "NOT SET"}`
      );
      console.error(
        `[Email] 🔑 App password length: ${
          process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0
        } chars (should be 16)`
      );
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNECTION") {
      console.error(`[Email] 🌐 NETWORK ERROR - Cannot connect to SMTP server`);
      console.error(
        `[Email] 💡 Check your internet connection and firewall settings`
      );
    } else if (error.code === "EMESSAGE") {
      console.error(
        `[Email] 📝 MESSAGE ERROR - Invalid email content or format`
      );
    }

    console.error(`[Email] �🔍 Full error details:`, {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
    });

    return { success: false, error: error.message };
  }
};

// Send Welcome Email for Google Sign-In
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "🎉 Welcome to Gemini Chatbot!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; border-radius: 15px; text-align: center; color: white; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
            <h1 style="margin: 0; font-size: 36px; font-weight: bold;">🤖 Welcome!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.95;">You're now part of Gemini Chatbot</p>
          </div>
          
          <!-- Welcome Message -->
          <div style="background: white; padding: 40px 30px; border-radius: 15px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h2 style="color: #333; margin: 0 0 20px 0; font-size: 24px;">Hi ${
              name || "there"
            }! 👋</h2>
            <p style="color: #555; line-height: 1.6; font-size: 16px; margin: 0 0 15px 0;">
              Thank you for signing up with <strong>Google Sign-In</strong>! We're thrilled to have you on board.
            </p>
            <p style="color: #555; line-height: 1.6; font-size: 16px; margin: 0 0 25px 0;">
              Your account is all set up and ready to go. Start chatting with our AI-powered assistant now!
            </p>
            
            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://chat-bot-frontend-eight-gray.vercel.app/chat" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 15px 40px; 
                        text-decoration: none; 
                        border-radius: 25px; 
                        font-weight: bold; 
                        font-size: 16px;
                        display: inline-block;
                        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                Start Chatting Now 💬
              </a>
            </div>
          </div>
          
          <!-- Features -->
          <div style="background: white; padding: 30px; border-radius: 15px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h3 style="color: #333; margin: 0 0 20px 0; font-size: 20px; text-align: center;">✨ What You Can Do</h3>
            <div style="display: grid; gap: 15px;">
              <div style="display: flex; align-items: start; gap: 15px;">
                <span style="font-size: 24px;">💬</span>
                <div>
                  <strong style="color: #667eea;">Chat with AI</strong>
                  <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Get intelligent responses powered by Google Gemini</p>
                </div>
              </div>
              <div style="display: flex; align-items: start; gap: 15px;">
                <span style="font-size: 24px;">📁</span>
                <div>
                  <strong style="color: #667eea;">Upload Files</strong>
                  <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Share images and documents for AI analysis</p>
                </div>
              </div>
              <div style="display: flex; align-items: start; gap: 15px;">
                <span style="font-size: 24px;">💾</span>
                <div>
                  <strong style="color: #667eea;">Save History</strong>
                  <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Access your conversations anytime, anywhere</p>
                </div>
              </div>
              <div style="display: flex; align-items: start; gap: 15px;">
                <span style="font-size: 24px;">✏️</span>
                <div>
                  <strong style="color: #667eea;">Edit & Regenerate</strong>
                  <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Refine your questions and get better answers</p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Tips -->
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 25px; border-radius: 15px; margin: 20px 0; color: white;">
            <h3 style="margin: 0 0 15px 0; font-size: 18px;">💡 Pro Tips</h3>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.8; font-size: 14px;">
              <li>Be specific with your questions for better responses</li>
              <li>Use the edit feature to refine your prompts</li>
              <li>Upload images for visual analysis and recognition</li>
              <li>All your chats are automatically saved</li>
            </ul>
          </div>
          
          <!-- Footer -->
          <div style="text-align: center; padding: 30px 20px 20px; color: #666; font-size: 14px;">
            <p style="margin: 0 0 10px 0;">Need help? Have questions?</p>
            <p style="margin: 0 0 20px 0;">We're here to assist you!</p>
            <div style="border-top: 2px solid #e0e0e0; padding-top: 20px; margin-top: 20px;">
              <p style="margin: 0; color: #999; font-size: 12px;">
                You're receiving this email because you signed up for Gemini Chatbot.
              </p>
              <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                © 2025 Gemini Chatbot. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
🎉 Welcome to Gemini Chatbot!

Hi ${name || "there"}!

Thank you for signing up with Google Sign-In! We're thrilled to have you on board.

Your account is all set up and ready to go. Start chatting with our AI-powered assistant now!

Visit: https://chat-bot-frontend-eight-gray.vercel.app/chat

✨ What You Can Do:
💬 Chat with AI - Get intelligent responses powered by Google Gemini
📁 Upload Files - Share images and documents for AI analysis
💾 Save History - Access your conversations anytime, anywhere
✏️ Edit & Regenerate - Refine your questions and get better answers

💡 Pro Tips:
• Be specific with your questions for better responses
• Use the edit feature to refine your prompts
• Upload images for visual analysis and recognition
• All your chats are automatically saved

Need help? Have questions? We're here to assist you!

© 2025 Gemini Chatbot. All rights reserved.
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[Email] ✅ Welcome email sent successfully to ${email}. Message ID: ${info.messageId}`
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      `[Email] ❌ Failed to send welcome email to ${email}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  validateEmailConfig,
};
