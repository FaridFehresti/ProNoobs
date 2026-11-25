# ProNoobs Dota

A tiny, dependency-free landing page. It is a single static HTML file, so Nginx can serve it directly without Node.js or a build step.

## Deploy on an Ubuntu Droplet

Replace `example.com` with your domain in the Nginx configuration and Certbot command below. The Cloudflare `@` and `www` A records should point to the Droplet IPv4, and remain **DNS only** while issuing the certificate. Allow inbound TCP ports 80 and 443 in the Droplet firewall.

```bash
sudo apt update
sudo apt install -y nginx git
sudo git clone https://github.com/FaridFehresti/ProNoobs.git /var/www/pronoobs
```

Configure Nginx for the domain:

```bash
sudo tee /etc/nginx/sites-available/pronoobs >/dev/null <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    root /var/www/pronoobs;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/pronoobs /etc/nginx/sites-enabled/pronoobs
sudo nginx -t && sudo systemctl reload nginx
```

After `http://example.com` loads, install a free Let's Encrypt certificate with Certbot:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d example.com -d www.example.com
sudo certbot renew --dry-run
```

To publish an update later:

```bash
cd /var/www/pronoobs
sudo git pull
```
