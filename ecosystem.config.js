// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "intervo-dev",
      script: "server.js",
      watch: true,
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
        PORT: 3003,
      },
    },
    {
      name: "intervo-prod",
      script: "server.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3004,
      },
    },
    {
      name: "intervo-staging",
      script: "server.js",
      watch: true,
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
        NODE_ENV: "staging",
        PORT: 3005,
      },
    },
  ],
};
