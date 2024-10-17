// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "twilio-webrtc-server",
      script: "server.js",
      watch: true, // Automatically restart on file change
      env: {
        NODE_ENV: "development",
        PORT: 3000, // Customize your environment variables here
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
