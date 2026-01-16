module.exports = {
  apps: [{
    name: "payverse",
    cwd: "/root/payverse",
    script: "dist/index.cjs",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://payverse:payverse123@localhost:5432/payverse",
      SESSION_SECRET: "payverse-secret-key-change-in-production"
    },
    max_restarts: 10,
    restart_delay: 3000
  }]
};
