-- ============================================================================
-- RutaTours · Instalación completa de la base de datos (estructura + datos iniciales)
-- ============================================================================
-- Uso (en el servidor):
--     mysql -u root -p < backend/database/rutatours.sql
--
-- Crea la base `rutatours`, todas sus tablas, la configuración inicial y, SOLO si
-- la base está vacía, los datos de ejemplo (5 métodos de pago, un guía, un vehículo
-- y la ruta "Eje Panamericano 2D/1N"). Se puede ejecutar de nuevo sin duplicar
-- datos ni borrar nada.
--
-- El usuario administrador (admin / admin123) lo crea el servidor al iniciar por
-- primera vez si no hay usuarios. Cambie esa clave al ingresar.
--
-- Usuario de MySQL para la aplicación (recomendado, ejecútelo aparte con su clave):
--     CREATE USER 'rutatours'@'localhost' IDENTIFIED BY 'una_clave_segura';
--     GRANT ALL PRIVILEGES ON rutatours.* TO 'rutatours'@'localhost';
--     FLUSH PRIVILEGES;
--
-- Convenciones:
--   * Todos los costos se configuran en USD (DECIMAL 12,2).
--   * Los montos en bolívares (VES) se calculan con la tasa BCV vigente y se
--     guardan como "foto" al momento del pago (tasa usada + monto VES).
-- ============================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS rutatours
    CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;

USE rutatours;

-- ==========================================
-- SISTEMA (plantilla)
-- ==========================================

-- Una sola fila (id = 1): nombre, colores y reglas generales de precios
CREATE TABLE IF NOT EXISTS configuracion (
    id               TINYINT PRIMARY KEY,
    nombre_sistema   VARCHAR(60) NOT NULL DEFAULT 'RutaTours',
    color_primario   CHAR(7) NOT NULL DEFAULT '#0f4c5c',
    color_secundario CHAR(7) NOT NULL DEFAULT '#1b7a8c',
    color_acento     CHAR(7) NOT NULL DEFAULT '#f2b705',
    -- Redondeo del precio por persona publicado al cliente (USD)
    -- modo: ninguno = al centavo | arriba = hacia arriba al paso | cercano = al paso más cercano
    redondeo_modo    ENUM('ninguno', 'arriba', 'cercano') NOT NULL DEFAULT 'arriba',
    redondeo_paso    DECIMAL(6,2) NOT NULL DEFAULT 0.10,
    actualizado_en   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Usuarios del sistema (administradores / operadores). NO son clientes.
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario      INT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    usuario         VARCHAR(50)  NOT NULL,
    password        VARCHAR(255) NOT NULL,
    rol             ENUM('admin', 'operador') NOT NULL DEFAULT 'operador',
    activo          TINYINT(1)   NOT NULL DEFAULT 1,
    creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuario_login (usuario)
) ENGINE=InnoDB;

INSERT IGNORE INTO configuracion (id) VALUES (1);

-- ==========================================
-- RECURSOS: GUÍAS Y VEHÍCULOS
-- ==========================================

CREATE TABLE IF NOT EXISTS guia (
    id_guia         INT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    documento       VARCHAR(20)  NOT NULL,
    telefono        VARCHAR(30)  NULL,
    email           VARCHAR(120) NULL,
    idiomas         VARCHAR(150) NULL,             -- Ej.: "Español, Inglés"
    licencia        VARCHAR(60)  NULL,             -- N° de licencia / acreditación
    costo_dia_usd   DECIMAL(12,2) NOT NULL DEFAULT 0,
    activo          TINYINT(1)   NOT NULL DEFAULT 1,  -- estado (alta / baja)
    disponible      TINYINT(1)   NOT NULL DEFAULT 1,  -- disponibilidad para asignar
    creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_guia_documento (documento)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehiculo (
    id_vehiculo                INT AUTO_INCREMENT PRIMARY KEY,
    placa                      VARCHAR(15)  NOT NULL,
    tipo                       VARCHAR(40)  NOT NULL,   -- Ej.: Van, Autobús, 4x4
    marca                      VARCHAR(50)  NULL,
    modelo                     VARCHAR(50)  NULL,
    capacidad                  SMALLINT UNSIGNED NOT NULL,  -- pasajeros
    costo_transporte_dia_usd   DECIMAL(12,2) NOT NULL DEFAULT 0,
    costo_combustible_dia_usd  DECIMAL(12,2) NOT NULL DEFAULT 0,
    activo                     TINYINT(1)   NOT NULL DEFAULT 1,
    disponible                 TINYINT(1)   NOT NULL DEFAULT 1,
    creado_en                  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vehiculo_placa (placa)
) ENGINE=InnoDB;

-- ==========================================
-- RUTAS / PLANES
-- ==========================================

CREATE TABLE IF NOT EXISTS ruta (
    id_ruta           INT AUTO_INCREMENT PRIMARY KEY,
    nombre            VARCHAR(120) NOT NULL,
    zona              VARCHAR(200) NULL,              -- Zona de operación
    descripcion       TEXT NULL,
    dias              TINYINT UNSIGNED NOT NULL DEFAULT 1,
    noches            TINYINT UNSIGNED NOT NULL DEFAULT 0,
    id_guia           INT NULL,
    id_vehiculo       INT NULL,
    min_personas      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    max_personas      SMALLINT UNSIGNED NOT NULL DEFAULT 1,  -- no puede superar la capacidad del vehículo
    abono_pct         DECIMAL(5,2) NOT NULL DEFAULT 50,      -- % mínimo para confirmar la reserva
    -- Fechas en que se puede agendar (todas opcionales)
    fecha_desde       DATE NULL,
    fecha_hasta       DATE NULL,
    dias_semana       VARCHAR(20) NULL,      -- "0,6" = domingo y sábado (0=dom ... 6=sáb). NULL = todos
    anticipacion_dias SMALLINT UNSIGNED NOT NULL DEFAULT 1, -- días mínimos entre hoy y la salida
    disponible        TINYINT(1) NOT NULL DEFAULT 1,  -- visible para agendar
    activa            TINYINT(1) NOT NULL DEFAULT 0,  -- estado; solo se activa si está completa
    creado_en         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ruta_guia     FOREIGN KEY (id_guia)     REFERENCES guia(id_guia)         ON DELETE SET NULL,
    CONSTRAINT fk_ruta_vehiculo FOREIGN KEY (id_vehiculo) REFERENCES vehiculo(id_vehiculo) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Recorrido esquemático: lista ORDENADA de paradas (el diagrama SVG se dibuja a partir de aquí)
CREATE TABLE IF NOT EXISTS ruta_parada (
    id_parada    INT AUTO_INCREMENT PRIMARY KEY,
    id_ruta      INT NOT NULL,
    orden        SMALLINT UNSIGNED NOT NULL,
    dia          TINYINT UNSIGNED NOT NULL DEFAULT 1,
    hora         TIME NULL,
    nombre       VARCHAR(120) NOT NULL,
    descripcion  TEXT NULL,
    tipo         ENUM('salida', 'embarque', 'visita', 'comida', 'alojamiento', 'retorno', 'llegada') NOT NULL DEFAULT 'visita',
    CONSTRAINT fk_parada_ruta FOREIGN KEY (id_ruta) REFERENCES ruta(id_ruta) ON DELETE CASCADE,
    KEY ix_parada_ruta (id_ruta, orden)
) ENGINE=InnoDB;

-- Actividades dentro de una parada (Ej.: almuerzo 12:20 en las Cuevas)
CREATE TABLE IF NOT EXISTS ruta_actividad (
    id_actividad INT AUTO_INCREMENT PRIMARY KEY,
    id_parada    INT NOT NULL,
    orden        SMALLINT UNSIGNED NOT NULL,
    dia          TINYINT UNSIGNED NULL,      -- NULL = mismo día de la parada (Ej.: desayuno del día 2 en el hotel)
    hora         TIME NULL,
    descripcion  VARCHAR(255) NOT NULL,
    CONSTRAINT fk_actividad_parada FOREIGN KEY (id_parada) REFERENCES ruta_parada(id_parada) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Costos en USD de la ruta
--   grupo   : se paga una vez por grupo (transporte, guía, botiquín, permisos...)
--   persona : se multiplica por N (entradas, alimentación, seguro...)
--   unidad  : se compra por unidades con cupo (habitaciones). Las filas con la misma
--             "categoria" son alternativas; el sistema elige la combinación más barata
--             que alcance para N personas, respetando cantidad_disponible.
CREATE TABLE IF NOT EXISTS ruta_costo (
    id_costo             INT AUTO_INCREMENT PRIMARY KEY,
    id_ruta              INT NOT NULL,
    orden                SMALLINT UNSIGNED NOT NULL,
    tipo                 ENUM('grupo', 'persona', 'unidad') NOT NULL,
    categoria            VARCHAR(60)  NOT NULL,      -- Ej.: Transporte, Alojamiento, Alimentación, Permisos
    concepto             VARCHAR(120) NOT NULL,      -- Ej.: Habitación cuádruple
    monto_usd            DECIMAL(12,2) NOT NULL,
    capacidad_unidad     SMALLINT UNSIGNED NULL,     -- solo tipo 'unidad': personas por unidad
    cantidad_disponible  SMALLINT UNSIGNED NULL,     -- solo tipo 'unidad': NULL = sin límite
    CONSTRAINT fk_costo_ruta FOREIGN KEY (id_ruta) REFERENCES ruta(id_ruta) ON DELETE CASCADE,
    KEY ix_costo_ruta (id_ruta, orden)
) ENGINE=InnoDB;

-- Cargos porcentuales en orden (ganancia, IVA, IGTF, otros)
--   base   : 'costo'     -> % sobre el costo del grupo
--            'acumulado' -> % sobre el costo + cargos anteriores (Ej.: IVA sobre costo + ganancia)
--   aplica : 'siempre'      -> entra en la cotización
--            'pago_divisas' -> solo al registrar un pago con método que aplique IGTF (sobre el monto pagado)
--   tipo   : 'ganancia' -> el cliente NO la ve: se suma dentro de "Servicio"
--            'impuesto' -> el cliente la ve como línea aparte
CREATE TABLE IF NOT EXISTS ruta_cargo (
    id_cargo    INT AUTO_INCREMENT PRIMARY KEY,
    id_ruta     INT NOT NULL,
    orden       SMALLINT UNSIGNED NOT NULL,
    nombre      VARCHAR(60) NOT NULL,
    tipo        ENUM('ganancia', 'impuesto') NOT NULL,
    porcentaje  DECIMAL(6,2) NOT NULL,
    base        ENUM('costo', 'acumulado') NOT NULL DEFAULT 'acumulado',
    aplica      ENUM('siempre', 'pago_divisas') NOT NULL DEFAULT 'siempre',
    CONSTRAINT fk_cargo_ruta FOREIGN KEY (id_ruta) REFERENCES ruta(id_ruta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Textos de la ficha: qué incluye, qué no incluye y recomendaciones
CREATE TABLE IF NOT EXISTS ruta_detalle (
    id_detalle  INT AUTO_INCREMENT PRIMARY KEY,
    id_ruta     INT NOT NULL,
    tipo        ENUM('incluye', 'no_incluye', 'recomendacion') NOT NULL,
    orden       SMALLINT UNSIGNED NOT NULL,
    texto       VARCHAR(500) NOT NULL,
    CONSTRAINT fk_detalle_ruta FOREIGN KEY (id_ruta) REFERENCES ruta(id_ruta) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ruta_imagen (
    id_imagen  INT AUTO_INCREMENT PRIMARY KEY,
    id_ruta    INT NOT NULL,
    archivo    VARCHAR(120) NOT NULL,   -- nombre del archivo dentro de /uploads
    orden      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT fk_imagen_ruta FOREIGN KEY (id_ruta) REFERENCES ruta(id_ruta) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ==========================================
-- CLIENTES (no son usuarios del sistema)
-- ==========================================

CREATE TABLE IF NOT EXISTS cliente (
    id_cliente      INT AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    documento       VARCHAR(20)  NOT NULL,
    email           VARCHAR(120) NOT NULL,
    telefono        VARCHAR(30)  NULL,
    password        VARCHAR(255) NOT NULL,
    activo          TINYINT(1)   NOT NULL DEFAULT 1,
    creado_en       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cliente_email (email),
    UNIQUE KEY uq_cliente_documento (documento)
) ENGINE=InnoDB;

-- ==========================================
-- TASA BCV (historial; la vigente es el último registro)
-- ==========================================

CREATE TABLE IF NOT EXISTS tasa_bcv (
    id_tasa        INT AUTO_INCREMENT PRIMARY KEY,
    valor          DECIMAL(14,4) NOT NULL,         -- Bs por 1 USD
    fuente         ENUM('scraping', 'manual') NOT NULL,
    fecha_valor    DATE NULL,                      -- "Fecha Valor" publicada por el BCV
    registrado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario     INT NULL,
    CONSTRAINT fk_tasa_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ==========================================
-- AGENDAS (RESERVAS) Y PAGOS
-- ==========================================

-- Métodos de pago configurables. moneda VES => el cliente paga en bolívares con la tasa vigente
CREATE TABLE IF NOT EXISTS metodo_pago (
    id_metodo    INT AUTO_INCREMENT PRIMARY KEY,
    nombre       VARCHAR(60) NOT NULL,
    moneda       ENUM('USD', 'VES') NOT NULL,
    aplica_igtf  TINYINT(1) NOT NULL DEFAULT 0,
    datos        VARCHAR(500) NULL,     -- instrucciones: banco, teléfono, correo Zelle...
    activo       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- Reserva: guarda la cotización completa (precios congelados al reservar)
CREATE TABLE IF NOT EXISTS agenda (
    id_agenda           INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente          INT NOT NULL,
    id_ruta             INT NOT NULL,
    id_guia             INT NULL,
    id_vehiculo         INT NULL,
    fecha_salida        DATE NOT NULL,
    fecha_regreso       DATE NOT NULL,
    personas            SMALLINT UNSIGNED NOT NULL,
    precio_persona_usd  DECIMAL(12,2) NOT NULL,
    total_usd           DECIMAL(12,2) NOT NULL,
    abono_minimo_usd    DECIMAL(12,2) NOT NULL,
    cotizacion          JSON NOT NULL,      -- desglose completo al momento de reservar
    estado              ENUM('pendiente_abono', 'reservada', 'pagada', 'completada', 'cancelada') NOT NULL DEFAULT 'pendiente_abono',
    notas               VARCHAR(500) NULL,
    creado_en           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_agenda_cliente  FOREIGN KEY (id_cliente)  REFERENCES cliente(id_cliente),
    CONSTRAINT fk_agenda_ruta     FOREIGN KEY (id_ruta)     REFERENCES ruta(id_ruta),
    CONSTRAINT fk_agenda_guia     FOREIGN KEY (id_guia)     REFERENCES guia(id_guia)         ON DELETE SET NULL,
    CONSTRAINT fk_agenda_vehiculo FOREIGN KEY (id_vehiculo) REFERENCES vehiculo(id_vehiculo) ON DELETE SET NULL,
    KEY ix_agenda_fechas (fecha_salida, fecha_regreso)
) ENGINE=InnoDB;

-- Pago reportado por el cliente y verificado por el administrador.
-- monto_usd = lo que abona a la reserva; igtf_usd = recargo si el método lo aplica;
-- total_usd = monto + igtf; monto_ves = total_usd * tasa_bcv (foto del momento del pago)
CREATE TABLE IF NOT EXISTS pago (
    id_pago         INT AUTO_INCREMENT PRIMARY KEY,
    id_agenda       INT NOT NULL,
    id_metodo       INT NOT NULL,
    referencia      VARCHAR(60) NOT NULL,
    comprobante     VARCHAR(120) NULL,          -- archivo en /uploads
    monto_usd       DECIMAL(12,2) NOT NULL,
    igtf_usd        DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_usd       DECIMAL(12,2) NOT NULL,
    id_tasa         INT NULL,
    tasa_bcv        DECIMAL(14,4) NULL,
    monto_ves       DECIMAL(16,2) NULL,
    estado          ENUM('pendiente', 'verificado', 'rechazado') NOT NULL DEFAULT 'pendiente',
    observacion     VARCHAR(255) NULL,
    id_usuario_verifica INT NULL,
    verificado_en   DATETIME NULL,
    creado_en       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pago_agenda  FOREIGN KEY (id_agenda) REFERENCES agenda(id_agenda),
    CONSTRAINT fk_pago_metodo  FOREIGN KEY (id_metodo) REFERENCES metodo_pago(id_metodo),
    CONSTRAINT fk_pago_tasa    FOREIGN KEY (id_tasa)   REFERENCES tasa_bcv(id_tasa) ON DELETE SET NULL,
    CONSTRAINT fk_pago_usuario FOREIGN KEY (id_usuario_verifica) REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ==========================================
-- DATOS DE EJEMPLO (solo si la base está vacía)
-- ==========================================
-- Todo es editable o se puede eliminar desde el panel de administración.

DROP PROCEDURE IF EXISTS rutatours_datos_ejemplo;
DELIMITER $$
CREATE PROCEDURE rutatours_datos_ejemplo()
BEGIN
  IF (SELECT COUNT(*) FROM ruta) = 0 AND (SELECT COUNT(*) FROM metodo_pago) = 0 THEN
    -- ---------- Métodos de pago (complete los datos reales desde el panel) ----------
    INSERT INTO metodo_pago (nombre, moneda, aplica_igtf, datos) VALUES
        ('Pago móvil',               'VES', 0, 'Banco, teléfono y cédula: configúrelos en el panel'),
        ('Transferencia en bolívares','VES', 0, 'Banco, cuenta y titular: configúrelos en el panel'),
        ('Zelle',                    'USD', 1, 'Correo y titular: configúrelos en el panel'),
        ('Efectivo en dólares',      'USD', 1, 'Pago en oficina'),
        ('USDT',                     'USD', 1, 'Red y dirección de billetera: configúrelas en el panel');

    -- ---------- Recursos ----------
    INSERT INTO guia (nombre, documento, telefono, email, idiomas, licencia, costo_dia_usd)
    VALUES ('Guía de ejemplo', 'V-00000000', NULL, NULL, 'Español', 'Acreditado', 30.00);
    SET @guia := LAST_INSERT_ID();

    INSERT INTO vehiculo (placa, tipo, marca, modelo, capacidad, costo_transporte_dia_usd, costo_combustible_dia_usd)
    VALUES ('AAA00A', 'Van', 'Toyota', 'Hiace', 15, 100.00, 0.00);
    SET @vehiculo := LAST_INSERT_ID();

    -- ---------- Ruta ----------
    INSERT INTO ruta (nombre, zona, descripcion, dias, noches, id_guia, id_vehiculo,
                      min_personas, max_personas, abono_pct, anticipacion_dias, disponible, activa)
    VALUES (
        'Eje Panamericano: Cuevas del Pirata, Jagüey y Palmarito',
        'Eje Panamericano (El Vigía - Palmarito - Zona de La Azulita / Torondoy)',
        'Dos días entre la montaña baja de La Azulita, las aguas termales de Jagüey y la playa de agua dulce de Palmarito, a orillas del Lago de Maracaibo.',
        2, 1, @guia, @vehiculo,
        4, 10, 50, 3, 1, 1
    );
    SET @ruta := LAST_INSERT_ID();

    -- ---------- Recorrido (paradas en orden) ----------
    INSERT INTO ruta_parada (id_ruta, orden, dia, hora, nombre, descripcion, tipo) VALUES
        (@ruta, 1, 1, '07:30', 'Mérida', 'Salida desde Mérida.', 'salida');
    INSERT INTO ruta_parada (id_ruta, orden, dia, hora, nombre, descripcion, tipo) VALUES
        (@ruta, 2, 1, NULL, 'El Vigía', 'Parada técnica y recogida de pasajeros adicionales.', 'embarque');
    INSERT INTO ruta_parada (id_ruta, orden, dia, hora, nombre, descripcion, tipo) VALUES
        (@ruta, 3, 1, '10:30', 'Cuevas del Pirata (La Azulita)', 'Excursión guiada por formaciones geológicas y leyendas locales en un clima fresco de montaña baja.', 'visita');
    SET @p_cuevas := LAST_INSERT_ID();
    INSERT INTO ruta_parada (id_ruta, orden, dia, hora, nombre, descripcion, tipo) VALUES
        (@ruta, 4, 1, '14:30', 'Hotel y Aguas Termales de Jagüey', 'Tarde de relajación, baños en pozas termales minerales y desconexión total.', 'alojamiento');
    SET @p_jaguey := LAST_INSERT_ID();
    INSERT INTO ruta_parada (id_ruta, orden, dia, hora, nombre, descripcion, tipo) VALUES
        (@ruta, 5, 2, '09:50', 'Palmarito (Full Day playero)', 'Playa de agua dulce, paseo en peñero tradicional por la orilla, tiempo libre para bañarse y ambiente tropical con palmeras.', 'visita');
    SET @p_palmarito := LAST_INSERT_ID();
    INSERT INTO ruta_parada (id_ruta, orden, dia, hora, nombre, descripcion, tipo) VALUES
        (@ruta, 6, 2, '19:30', 'Mérida', 'Llegada estipulada a Mérida. Fin de los servicios.', 'llegada');

    INSERT INTO ruta_actividad (id_parada, orden, dia, hora, descripcion) VALUES
        (@p_cuevas,    1, NULL, '10:30', 'Excursión guiada por las cuevas'),
        (@p_cuevas,    2, NULL, '12:20', 'Almuerzo afuera de las Cuevas (incluido)'),
        (@p_cuevas,    3, NULL, '13:00', 'Salida hacia las aguas termales'),
        (@p_jaguey,    1, NULL, '14:30', 'Check-in e instalación en el complejo; disfrute de las pozas termales'),
        (@p_jaguey,    2, 2,    '08:00', 'Desayuno típico regional en el hospedaje'),
        (@p_jaguey,    3, 2,    '09:00', 'Salida hacia el pueblo pesquero de Palmarito'),
        (@p_palmarito, 1, NULL, '12:30', 'Almuerzo playero con pescado frito de la zona (incluido)'),
        (@p_palmarito, 2, NULL, '16:00', 'Retorno definitivo a la ciudad de Mérida');

    -- ---------- Costos (USD) ----------
    INSERT INTO ruta_costo (id_ruta, orden, tipo, categoria, concepto, monto_usd, capacidad_unidad, cantidad_disponible) VALUES
        (@ruta, 1, 'grupo',   'Transporte',   'Transporte terrestre privado (2 días)',          200.00, NULL, NULL),
        (@ruta, 2, 'grupo',   'Guía',         'Guía turístico profesional acreditado (2 días)', 60.00,  NULL, NULL),
        (@ruta, 3, 'grupo',   'Salud',        'Botiquín y fondo de contingencia médica',        10.00,  NULL, NULL),
        (@ruta, 4, 'unidad',  'Alojamiento',  'Habitación cuádruple (incluye aguas termales)',  60.00,  4,    2),
        (@ruta, 5, 'unidad',  'Alojamiento',  'Habitación doble (incluye aguas termales)',      45.00,  2,    1),
        (@ruta, 6, 'persona', 'Entradas',     'Entrada a Las Cuevas del Pirata',                1.00,   NULL, NULL),
        (@ruta, 7, 'persona', 'Alimentación', 'Desayuno típico (día 2)',                        3.00,   NULL, NULL),
        (@ruta, 8, 'persona', 'Alimentación', 'Almuerzos ejecutivo y playero',                  13.00,  NULL, NULL),
        (@ruta, 9, 'persona', 'Fotografía',   'Cobertura fotográfica digital',                  1.00,   NULL, NULL);

    -- ---------- Cargos porcentuales (en orden) ----------
    INSERT INTO ruta_cargo (id_ruta, orden, nombre, tipo, porcentaje, base, aplica) VALUES
        (@ruta, 1, 'Ganancia', 'ganancia', 25.00, 'costo',     'siempre'),
        (@ruta, 2, 'IVA',      'impuesto', 16.00, 'acumulado', 'siempre'),
        (@ruta, 3, 'IGTF',     'impuesto',  3.00, 'acumulado', 'pago_divisas');

    -- ---------- Ficha ----------
    INSERT INTO ruta_detalle (id_ruta, tipo, orden, texto) VALUES
        (@ruta, 'incluye', 1, 'Transporte terrestre privado durante los dos días'),
        (@ruta, 'incluye', 2, 'Noche de alojamiento en hotel'),
        (@ruta, 'incluye', 3, 'Desayuno (día 2) y almuerzo (día 1 y 2)'),
        (@ruta, 'incluye', 4, 'Entrada a las Cuevas del Pirata'),
        (@ruta, 'incluye', 5, 'Entrada al Complejo de Aguas Termales de Jagüey (incluida con la noche de hospedaje)'),
        (@ruta, 'incluye', 6, 'Guía turístico profesional acreditado durante todo el trayecto'),
        (@ruta, 'incluye', 7, 'Salud y bienestar preventivo: botiquín de primeros auxilios y enlace a centro de salud en caso de emergencia'),
        (@ruta, 'incluye', 8, 'Cobertura fotográfica digital del viaje'),
        (@ruta, 'no_incluye', 1, 'Cenas de ningún día'),
        (@ruta, 'no_incluye', 2, 'En Palmarito: paseos extras en peñero o consumo personal'),
        (@ruta, 'no_incluye', 3, 'Gastos adicionales (snacks, souvenirs, etc.)'),
        (@ruta, 'recomendacion', 1, 'Equipaje mixto: ropa fresca y de baño, y ropa ligera pero de manga larga para la caminata.'),
        (@ruta, 'recomendacion', 2, 'Hidratación y protección: repelente de insectos, protector solar y lentes de sol por el cambio altitudinal y climático hacia la zona cálida.'),
        (@ruta, 'recomendacion', 3, 'Lleve sus medicamentos personales si sigue un tratamiento médico específico.');
  END IF;
END$$
DELIMITER ;

CALL rutatours_datos_ejemplo();
DROP PROCEDURE rutatours_datos_ejemplo;
