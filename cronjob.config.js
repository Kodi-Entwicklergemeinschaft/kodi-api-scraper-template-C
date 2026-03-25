require('dotenv').config();

module.exports = {
  apps: [{
    name: `WebScraper${process.env.REGION ? "-" + process.env.REGION : ""}`,
    script: "./index.js",
    instances: 1,
    exec_mode: 'fork',
    cron_restart: process.env.CRON_RESTART || "0 6 * * *",
    autorestart: false
  }]
}