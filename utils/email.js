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

module.exports = {
  sendOTPEmail,
  validateEmailConfig,
};
