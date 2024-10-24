// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "twilio",
      script: "server.js",
      watch: false, // Automatically restart on file change
       ignore_watch: ["./public", "logs"], // Ignore 'public' and 'logs' directories
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