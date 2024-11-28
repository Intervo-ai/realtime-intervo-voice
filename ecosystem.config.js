// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "twilio",
      script: "server.js",
      watch: true, // Automatically restart on file change
 ignore_watch: [
      ".git",
      ".git/*",
        "node_modules",
        "logs",
      ],
      watch_options: {
        followSymlinks: false,
      },
      env: {
        NODE_ENV: "development",
        PORT: 3003, // Customize your environment variables here
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
