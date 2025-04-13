const mongoose = require("mongoose");

const linkSchema = new mongoose.Schema({
  url: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Link", linkSchema);
