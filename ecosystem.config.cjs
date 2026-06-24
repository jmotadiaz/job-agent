module.exports = {
  apps: [
    {
      name: 'job-agent',
      script: 'pnpm',
      args: 'start -p 3010',
      env_file: '.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      out_file: './log/pm2/out.log',
      error_file: './log/pm2/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
