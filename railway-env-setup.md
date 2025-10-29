# Railway Environment Variables Setup

## Required Environment Variables for Railway

Go to your Railway project → Select your service → Click "Variables" tab → Add these:

```
GEMINI_API_KEY=AIzaSyD97SkBtO1ArN9mRos6VHz715w-SNsFBLw
MONGO_URI=mongodb+srv://Naeem:naeem12345@cluster0.ylwye9b.mongodb.net/chatbot?retryWrites=true&w=majority
PORT=8080
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-12345
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=nbcuilahore@gmail.com
SMTP_PASS=lsgvjfdwpdvqjptp
SMTP_FROM=nbcuilahore@gmail.com
NODE_ENV=production
```

## Steps:

1. Go to https://railway.app/dashboard
2. Click on your project: `chatbotserver-production-6d4b`
3. Click on the service (your backend)
4. Click on the "Variables" tab
5. Click "New Variable"
6. Add each variable above one by one
7. After adding all variables, Railway will automatically redeploy

## Important Notes:

- **JWT_SECRET**: Generate a random secure string for production. You can use: `openssl rand -base64 32` or any random string generator
- **MONGO_URI**: Make sure your MongoDB Atlas allows connections from anywhere (0.0.0.0/0) for Railway to connect
- **GEMINI_API_KEY**: This is your Google AI Studio API key
- **SMTP credentials**: Your Gmail app password for sending OTP emails

## After Setup:

- Wait 2-3 minutes for Railway to redeploy
- Check deployment logs in Railway to ensure no errors
- Test your app - previous chats should load now!

## Verify MongoDB Connection:

In Railway logs, you should see:

```
✅ Connected to MongoDB: chatbot
```

If you see connection errors, check:

1. MongoDB Atlas → Network Access → Allow access from anywhere
2. MONGO_URI is correct (no typos, includes database name)
3. MongoDB user has read/write permissions
