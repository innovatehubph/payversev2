module.exports = {
  apps: [{
    name: "payverse",
    cwd: "/root/payverse",
    script: "npm",
    args: "run dev",
    env: {
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://payverse:payverse123@localhost:5432/payverse",
      SESSION_SECRET: "payverse-secret-key-change-in-production"
    }
  }]
};
