module.exports = {
  apps: [{
    name: 'wa-gateway',
    cwd: '/opt/wa-gateway',
    script: 'dist/main.js',
    node_args: '--env-file=.env',
    max_memory_restart: '1500M',
    kill_timeout: 8000,
  }],
};
