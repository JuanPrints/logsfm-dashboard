module.exports = {
  apps: [
    {
      name: "logsfm-dashboard",
      cwd: "/root/apps/logsfm-dashboard",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3020,
        HOST: "0.0.0.0",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      error_file: "/root/apps/logsfm-dashboard/logs/err.log",
      out_file: "/root/apps/logsfm-dashboard/logs/out.log",
      merge_logs: true,
    },
  ],
};
