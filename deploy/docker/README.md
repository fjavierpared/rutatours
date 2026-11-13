# Despliegue con Docker (VPS con nginx y MySQL en contenedores)

Para un VPS donde ya corren un contenedor **nginx** (puertos 80/443), un **certbot** y un **MySQL**
en la red `docker_webnet`. RutaTours se suma como un contenedor más (`rutatours-web`) sin tocar
los otros sistemas.

Ejemplo con `DOMINIO=rutatours.venustechfp.com`. Ajuste las rutas si su carpeta de nginx es otra.

## 1. DNS (Cloudflare)

Registro **A**: nombre `rutatours`, valor `161.97.83.13`.
Déjelo en **DNS only (nube gris)** hasta emitir el certificado (paso 6); luego puede activar el proxy.

## 2. Código

```bash
git clone https://github.com/fjavierpared/rutatours.git ~/rutatours
cd ~/rutatours
```

## 3. Base de datos (en el contenedor `mysql`)

```bash
docker cp backend/database/rutatours.sql mysql:/tmp/rutatours.sql
docker exec -it mysql mysql -uroot -p -e "SOURCE /tmp/rutatours.sql"
docker exec -it mysql mysql -uroot -p -e "
  CREATE USER IF NOT EXISTS 'rutatours'@'%' IDENTIFIED BY 'CLAVE_SEGURA';
  GRANT ALL PRIVILEGES ON rutatours.* TO 'rutatours'@'%'; FLUSH PRIVILEGES;"
docker exec mysql rm /tmp/rutatours.sql
```

Cada comando pide la clave de root de MySQL. `rutatours.sql` se puede volver a ejecutar sin duplicar datos.

## 4. Configuración

```bash
cp backend/.env.example backend/.env
chmod 600 backend/.env
nano backend/.env
```

```ini
DB_HOST=mysql
DB_USER=rutatours
DB_PASSWORD=CLAVE_SEGURA
DB_NAME=rutatours
DB_PORT=3306
JWT_SECRET=        # pegue la salida de: openssl rand -hex 48
BCV_SSL_INSEGURO=1
```

`HOST` y `PORT` los fija `docker-compose.yml`.

## 5. Contenedor

```bash
docker compose up -d --build
docker compose logs --tail 20          # debe decir "Conectado a MySQL"
curl -s http://127.0.0.1:4330/api/tasa-bcv
```

## 6. nginx y certificado HTTPS

```bash
N=~/docker/nginx/conf.d                 # carpeta conf.d del contenedor nginx
sed 's/DOMINIO/rutatours.venustechfp.com/g' deploy/docker/nginx-1-http.conf > $N/rutatours.conf
docker exec nginx nginx -t && docker exec nginx nginx -s reload

docker exec certbot certbot certonly --webroot -w /var/www/certbot \
  -d rutatours.venustechfp.com --email SU_CORREO --agree-tos --no-eff-email

sed 's/DOMINIO/rutatours.venustechfp.com/g' deploy/docker/nginx-2-https.conf > $N/rutatours.conf
docker exec nginx nginx -t && docker exec nginx nginx -s reload
```

El contenedor `certbot` ya renueva los certificados cada 12 horas.

## 7. Primer ingreso

`https://rutatours.venustechfp.com/admin` → **admin / admin123** → cambie la clave de inmediato.
Luego actualice la tasa BCV y complete los métodos de pago.

## Actualizar

```bash
cd ~/rutatours && git pull && docker compose up -d --build
```

Si cambió la estructura de la base, repita el paso 3 (no borra datos).

## Respaldo

```bash
docker exec mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction rutatours' | gzip > ~/respaldo-rutatours-$(date +%F).sql.gz
docker run --rm -v rutatours_uploads:/u -v ~:/r alpine tar -czf /r/respaldo-uploads-$(date +%F).tar.gz -C /u .
```
(Ajuste la variable de la clave de root a la de su contenedor de MySQL.)
