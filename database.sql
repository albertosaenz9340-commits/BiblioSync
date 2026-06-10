-- =====================================================
-- BiblioSync v2.0 — Script de base de datos
-- Sistema de Gestión de Recursos Educativos
-- =====================================================

DROP DATABASE IF EXISTS bibliosync;
CREATE DATABASE bibliosync
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE bibliosync;

-- =====================================================
-- 1. USUARIOS
-- Roles: 'Estudiante', 'Docente', 'Administrador'
-- Estado: 'Activo', 'Sancionado', 'Inactivo'
-- jerarquia: 'Principal' solo para el primer Admin
-- =====================================================
CREATE TABLE usuarios (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    nombre           VARCHAR(100)  NOT NULL,
    usuario_login    VARCHAR(50)   NOT NULL UNIQUE,
    password         VARCHAR(255)  NOT NULL,
    cedula           VARCHAR(20)   NOT NULL UNIQUE,
    correo           VARCHAR(100)  NOT NULL UNIQUE,
    tipo_rol         VARCHAR(20)   NOT NULL DEFAULT 'Estudiante',
    jerarquia        VARCHAR(20)   NOT NULL DEFAULT 'Normal',  -- 'Principal' | 'Normal'
    estado           VARCHAR(20)   NOT NULL DEFAULT 'Activo',
    descripcion      VARCHAR(500)  NOT NULL DEFAULT '',
    foto_url         VARCHAR(500)  NOT NULL DEFAULT '',        -- URL de Cloudinary
    foto_public_id   VARCHAR(255)  NOT NULL DEFAULT '',        -- ID en Cloudinary para eliminar
    rol_anterior     VARCHAR(20)   NOT NULL DEFAULT 'Estudiante', -- Rol antes de ser Admin
    fecha_registro   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_rol      CHECK (tipo_rol   IN ('Estudiante', 'Docente', 'Administrador')),
    CONSTRAINT chk_estado   CHECK (estado     IN ('Activo', 'Sancionado', 'Inactivo')),
    CONSTRAINT chk_jerarq   CHECK (jerarquia  IN ('Principal', 'Normal'))
);

-- =====================================================
-- 2. CÓDIGOS DE RECUPERACIÓN
-- =====================================================
CREATE TABLE codigos_recuperacion (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id  INT         NOT NULL,
    codigo      VARCHAR(20) NOT NULL,
    expiracion  DATETIME    NOT NULL,
    usado       TINYINT(1)  NOT NULL DEFAULT 0,

    FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE
);

-- =====================================================
-- 3. SOLICITUDES DE ADMINISTRADOR
-- Un usuario solicita privilegios al Admin Principal
-- Estado: 'Pendiente', 'Aprobada', 'Rechazada'
-- =====================================================
CREATE TABLE solicitudes_admin (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id      INT          NOT NULL,
    mensaje         VARCHAR(500) NOT NULL DEFAULT '',
    estado          VARCHAR(20)  NOT NULL DEFAULT 'Pendiente',
    fecha_solicitud TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion DATETIME,

    CONSTRAINT chk_estado_sol CHECK (estado IN ('Pendiente', 'Aprobada', 'Rechazada')),

    FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE
);

-- =====================================================
-- 4. LIBROS / MATERIAL EDUCATIVO
-- Ahora incluye sinopsis, pdf_url y pdf_public_id
-- =====================================================
CREATE TABLE libros (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    titulo         VARCHAR(150) NOT NULL,
    autor          VARCHAR(100) NOT NULL,
    isbn           VARCHAR(30)  NOT NULL UNIQUE,
    editorial      VARCHAR(100),
    anio           INT,
    categoria      VARCHAR(50)  NOT NULL,
    cantidad       INT          NOT NULL DEFAULT 1,
    sinopsis       TEXT,
    imagen         VARCHAR(500) NOT NULL DEFAULT '',           -- URL Cloudinary
    imagen_public_id VARCHAR(255) NOT NULL DEFAULT '',         -- ID Cloudinary
    pdf_url        VARCHAR(500) NOT NULL DEFAULT '',           -- URL Cloudinary (acceso controlado)
    pdf_public_id  VARCHAR(255) NOT NULL DEFAULT '',           -- ID Cloudinary

    CONSTRAINT chk_cantidad CHECK (cantidad >= 0)
);

-- =====================================================
-- 5. PRÉSTAMOS
-- =====================================================
CREATE TABLE prestamos (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id       INT          NOT NULL,
    libro_id         INT          NOT NULL,
    fecha_prestamo   DATETIME     NOT NULL,
    fecha_devolucion DATETIME     NOT NULL,
    estado           VARCHAR(20)  NOT NULL DEFAULT 'Activo',
    referencia       VARCHAR(30)  NOT NULL UNIQUE,

    CONSTRAINT chk_estado_prestamo CHECK (estado IN ('Activo', 'Devuelto', 'Vencido')),

    FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    FOREIGN KEY (libro_id)
        REFERENCES libros(id)
        ON DELETE CASCADE
);

-- =====================================================
-- 6. MENSAJES
-- Mensajería interna entre usuarios
-- =====================================================
CREATE TABLE mensajes (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    remitente_id INT          NOT NULL,
    receptor_id  INT          NOT NULL,
    contenido    TEXT         NOT NULL,
    leido        TINYINT(1)   NOT NULL DEFAULT 0,
    fecha_envio  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (remitente_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE,

    FOREIGN KEY (receptor_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE
);

-- =====================================================
-- 7. ÍNDICES DE OPTIMIZACIÓN
-- =====================================================
ALTER TABLE libros    ADD INDEX idx_libros_categoria   (categoria);
ALTER TABLE usuarios  ADD INDEX idx_usuarios_rol       (tipo_rol);
ALTER TABLE usuarios  ADD INDEX idx_usuarios_estado    (estado);
ALTER TABLE usuarios  ADD INDEX idx_usuarios_jerarquia (jerarquia);
ALTER TABLE prestamos ADD INDEX idx_prestamos_usuario  (usuario_id);
ALTER TABLE prestamos ADD INDEX idx_prestamos_libro    (libro_id);
ALTER TABLE prestamos ADD INDEX idx_prestamos_estado   (estado);
ALTER TABLE codigos_recuperacion ADD INDEX idx_codigos_usuario (usuario_id);
ALTER TABLE mensajes  ADD INDEX idx_mensajes_remitente (remitente_id);
ALTER TABLE mensajes  ADD INDEX idx_mensajes_receptor  (receptor_id);
ALTER TABLE mensajes  ADD INDEX idx_mensajes_leido     (leido);
ALTER TABLE solicitudes_admin ADD INDEX idx_sol_usuario (usuario_id);
ALTER TABLE solicitudes_admin ADD INDEX idx_sol_estado  (estado);

-- =====================================================
-- 8. DATOS INICIALES
-- Sin usuarios semilla — el primer usuario que se registre
-- podrá elegir el rol de Administrador Principal
-- desde el formulario de registro.
-- El catálogo inicia vacío.
-- =====================================================
