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
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        FFMPEG_PATH: "/usr/bin/ffmpeg",
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
