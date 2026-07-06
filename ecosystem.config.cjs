module.exports = {
  apps: [
    {
      name: "westpay",
      script: "dist/index.cjs",
      instances: 1,
      exec_mode: "fork",
      node_args: [],
      env: {
        NODE_ENV: "production",
        PORT: "5000",
      },
      // Redémarre automatiquement en cas de crash
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      // Logs
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
