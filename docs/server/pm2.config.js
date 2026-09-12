// PM2 Ecosystem Config — ERP NEXT1
// Jalankan: pm2 start pm2.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'erp-next1',
      script: './dist/main.js',
      cwd: '/home/next1/erp-next1',
      interpreter: 'node',
      node_args: '--env-file=/home/next1/erp-next1/.env',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DDTHH:mm:ss',
      out_file: '/home/next1/.pm2/logs/erp-next1-out.log',
      error_file: '/home/next1/.pm2/logs/erp-next1-error.log',
    },
  ],
};
