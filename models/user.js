const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    verified: { type: Boolean, default: true },
    googleId: { type: String, sparse: true, unique: true },
    profilePicture: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
