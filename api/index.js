const app = require("../app");
const db = require("../db");

let isInitialized = false;

module.exports = async (req, res) => {
  if (!isInitialized) {
    try {
      await db.init();
    } catch (err) {
      console.error("[Vercel DB Init Error]:", err);
    }
    isInitialized = true;
  }
  return app(req, res);
};
