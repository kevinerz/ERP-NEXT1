$PLINK  = 'C:\Program Files\PuTTY\plink.exe'
$PSCP   = 'C:\Program Files\PuTTY\pscp.exe'
$HKEY   = 'ssh-ed25519 255 SHA256:sCSIWMCLXK0pdNxFY5QRRwxbeB2pzFMR4AwA7uh0oXk'
$PW     = 'admion271017'
$HOST   = '103.12.28.10'
$PORT   = '8844'
$REMOTE = '/home/erp-next1/dist/modules/email/'

Write-Host "Upload imap.client.js + smtp.client.js ..."
& $PSCP -batch -hostkey $HKEY -pw $PW -P $PORT `
  "dist\modules\email\imap.client.js" `
  "dist\modules\email\smtp.client.js" `
  "root@${HOST}:${REMOTE}"

Write-Host "Restart PM2 ..."
& $PLINK -batch -hostkey $HKEY -pw $PW -P $PORT root@$HOST "pm2 restart erp-next1 && pm2 logs erp-next1 --lines 8 --nostream"

Write-Host "Done."
