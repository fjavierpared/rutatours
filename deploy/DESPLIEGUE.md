# Despliegue de RutaTours en un VPS (Ubuntu 22.04 / 24.04)

Resultado: el catálogo en `https://DOMINIO/` y el panel en `https://DOMINIO/admin`,
con HTTPS, arranque automático y respaldo diario.

Reemplace `DOMINIO` por el dominio real (Ej.: `rutatours.venutech.com`).

## 0. DNS

En el panel del proveedor del dominio cree un registro **A**:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `rutatours` (o `@` para el dominio raíz) | IP pública del VPS |

Compruebe con `dig +short DOMINIO` que responde la IP del VPS antes del paso 6.

## 1. Paquetes del sistema

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs mysql-server nginx certbot python3-certbot-nginx git
node -v    # v22.x
```

## 2. Código

```bash
sudo useradd --system --home-dir /opt/rutatours --shell /usr/sbin/nologin rutatours
sudo git clone https://github.com/fjavierpared/rutatours.git /opt/rutatours
sudo mkdir -p /opt/rutatours/uploads
sudo chown -R rutatours:rutatours /opt/rutatours
cd /opt/rutatours/backend && sudo -u rutatours npm ci --omit=dev
```

## 3. Base de datos

```bash
sudo mysql < /opt/rutatours/backend/database/rutatours.sql
sudo mysql -e "CREATE USER 'rutatours'@'localhost' IDENTIFIED BY 'CLAVE_SEGURA';
               GRANT ALL PRIVILEGES ON rutatours.* TO 'rutatours'@'localhost'; FLUSH PRIVILEGES;"
```

`rutatours.sql` crea todas las tablas y, si la base está vacía, la ruta de ejemplo.
Se puede volver a ejecutar sin duplicar datos.

## 4. Configuración (`backend/.env`)

```bash
sudo -u rutatours cp /opt/rutatours/backend/.env.example /opt/rutatours/backend/.env
sudo -u rutatours nano /opt/rutatours/backend/.env
sudo chmod 600 /opt/rutatours/backend/.env
```

Valores para producción:

```ini
DB_HOST=127.0.0.1
DB_USER=rutatours
DB_PASSWORD=CLAVE_SEGURA
DB_NAME=rutatours
DB_PORT=3306
PORT=3000
HOST=127.0.0.1
JWT_SECRET=           # genere uno con: openssl rand -hex 48
BCV_SSL_INSEGURO=1
```

## 5. Servicio (arranque automático)

```bash
sudo cp /opt/rutatours/deploy/rutatours.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rutatours
sudo systemctl status rutatours        # debe decir "active (running)"
curl -s http://127.0.0.1:3000/api/tasa-bcv
```

## 6. Nginx y HTTPS

```bash
sudo cp /opt/rutatours/deploy/nginx-rutatours.conf /etc/nginx/sites-available/rutatours
sudo sed -i 's/DOMINIO/rutatours.venutech.com/g' /etc/nginx/sites-available/rutatours
sudo ln -s /etc/nginx/sites-available/rutatours /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d rutatours.venutech.com
sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw --force enable
```

## 7. Primer ingreso

1. Abra `https://DOMINIO/admin` e ingrese con **admin / admin123**. **Cambie la clave de inmediato.**
2. En **Tasa BCV** pulse «Actualizar desde el BCV».
3. Complete los **Métodos de pago** con sus datos reales y cargue sus rutas.

## Actualizar a una versión nueva

```bash
cd /opt/rutatours
sudo -u rutatours git pull
cd backend && sudo -u rutatours npm ci --omit=dev
sudo mysql < database/rutatours.sql     # solo si cambió la estructura; no borra datos
sudo systemctl restart rutatours
```

## Respaldo diario (base de datos + fotos)

```bash
sudo mkdir -p /var/backups/rutatours
sudo tee /etc/cron.daily/rutatours-respaldo >/dev/null <<'EOF'
#!/bin/sh
F=$(date +%F)
mysqldump --single-transaction rutatours | gzip > /var/backups/rutatours/bd-$F.sql.gz
tar -czf /var/backups/rutatours/uploads-$F.tar.gz -C /opt/rutatours uploads
find /var/backups/rutatours -type f -mtime +30 -delete
EOF
sudo chmod +x /etc/cron.daily/rutatours-respaldo
```

## Problemas frecuentes

| Síntoma | Revise |
|---|---|
| 502 Bad Gateway | `sudo systemctl status rutatours` y `sudo journalctl -u rutatours -n 50` |
| «Error de base de datos» en el registro | Usuario y clave de MySQL en `backend/.env` |
| No se pueden subir fotos | Permisos: `sudo chown -R rutatours:rutatours /opt/rutatours/uploads` |
| Falla «Actualizar desde el BCV» | El sitio del BCV no responde o cambió: use la carga manual |
| El dominio no abre | `dig +short DOMINIO` debe dar la IP del VPS |
