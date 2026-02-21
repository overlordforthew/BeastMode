#!/bin/bash
# Auto-deploy script — called by webhook on git push
set -e
cd /root/BeastMode
git pull origin main
npm install --production
pm2 restart beastmode 2>/dev/null || pm2 start server.js --name beastmode
echo "$(date) — BeastMode deployed" >> /var/log/beastmode-deploy.log
