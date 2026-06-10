# 📚 BiblioSync v2.0
### Sistema Inteligente de Gestión y Sincronización de Recursos Educativos
> Versión 2.0 — Departamento de Atlántico

🌐 **Sistema en producción:** https://bibliosync-production.up.railway.app

---

## 📋 Descripción

BiblioSync es un sistema web completo para la gestión de préstamos de material bibliográfico en instituciones educativas. La versión 2.0 incorpora mensajería interna en tiempo real con SignalR, perfiles de usuario con foto, acceso controlado a PDFs por préstamo activo, almacenamiento en Cloudinary, sistema de administración jerárquica, sanción automática y notificaciones persistentes.

**Stack tecnológico:**
- **Backend:** ASP.NET Core 8 / C# — API REST
- **Base de datos:** MySQL — Entity Framework Core + Pomelo
- **Frontend:** SPA manual en HTML / CSS / JavaScript puro
- **Tiempo real:** SignalR (WebSockets)
- **Almacenamiento:** Cloudinary (fotos de perfil, portadas y PDFs)
- **Autenticación:** JWT con BCrypt
- **Despliegue:** Railway

---

## 🗂️ Estructura del proyecto

```
BiblioSync/
│
├── Controllers/
│   ├── UsuariosController.cs       # Auth JWT, perfil, foto, jerarquía, solicitudes admin
│   ├── LibrosController.cs         # Catálogo, portadas, PDFs, firma Cloudinary
│   ├── PrestamosController.cs      # Préstamos, devoluciones, acceso controlado a PDF
│   └── MensajesController.cs       # Mensajería interna, conversaciones, no leídos
│
├── Data/
│   └── AppDbContext.cs             # Contexto Entity Framework Core
│
├── DTOs/
│   ├── RegistroDTO.cs              # + campo EsPrincipal
│   ├── LoginDTO.cs
│   ├── LibroDTO.cs
│   ├── PrestamoDTO.cs
│   ├── PerfilDTO.cs                # PerfilDTO + CambioEstadoDTO + CambioRolDTO
│   ├── MensajeDTO.cs               # MensajeDTO + MarcarLeidoDTO
│   ├── SolicitudRecuperacionDTO.cs
│   ├── SolicitudAdminDTO.cs        # SolicitudAdminDTO + ResolucionSolicitudDTO
│   ├── CambioPasswordDTO.cs
│   └── ConfirmarPdfDTO.cs          # Para upload directo a Cloudinary
│
├── Hubs/
│   └── ChatHub.cs                  # SignalR — WebSockets, grupos, presencia online
│
├── Models/
│   ├── Usuario.cs                  # Roles, jerarquía, foto, rol anterior
│   ├── Libro.cs                    # Sinopsis, portada y PDF en Cloudinary
│   ├── Prestamo.cs
│   ├── CodigoRecuperacion.cs
│   ├── Mensaje.cs
│   └── SolicitudAdmin.cs
│
├── Services/
│   ├── CloudinaryService.cs        # Subida y eliminación de imágenes y PDFs
│   └── SancionAutomaticaService.cs # BackgroundService — sanción automática cada hora
│
├── wwwroot/
│   ├── index.html                  # SPA con 9 secciones + 5 modales + popover libro
│   ├── style.css                   # Paleta institucional completa
│   ├── script.js                   # ~2200 líneas — lógica completa del frontend
│   └── img/
│       └── libro-placeholder.png
│
├── appsettings.json
├── BiblioSync.csproj
├── database.sql
└── Program.cs
```

---

## ⚙️ Requisitos previos

| Herramienta | Versión mínima |
|---|---|
| .NET SDK | 8.0 |
| MySQL Server | 8.0 |
| Cuenta Cloudinary | Gratuita |
| Navegador moderno | Chrome / Edge / Firefox |

---

## 🚀 Instalación

### 1. Crear la base de datos

```sql
source C:/ruta/al/proyecto/BiblioSync/database.sql
```

### 2. Configurar `appsettings.json`

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "server=localhost;database=bibliosync;user=root;password=TU_PASSWORD;"
  },
  "Jwt": {
    "Secret": "BiblioSync-Clave-Secreta-JWT-2026-Atlantico-32ch"
  },
  "Prestamo": {
    "DiasPlazo": 8
  },
  "Cloudinary": {
    "CloudName": "TU_CLOUD_NAME",
    "ApiKey":    "TU_API_KEY",
    "ApiSecret": "TU_API_SECRET"
  }
}
```

> Las credenciales de Cloudinary se obtienen en `console.cloudinary.com/settings/api-keys`.
> En Cloudinary → Settings → Security → activar **"Allow delivery of PDF and ZIP files"**.

### 3. Restaurar dependencias y ejecutar

```bash
dotnet restore
dotnet run
```

### 4. Abrir en el navegador

```
http://localhost:5000
```

---

## 👤 Primer acceso

Al abrir el formulario de registro por primera vez, el selector de rol mostrará la opción **⭐ Administrador Principal**. El primer usuario que se registre con ese rol se convierte en el responsable del sistema. A partir del segundo registro, esa opción desaparece.

---

## 👥 Roles del sistema

| Rol | Jerarquía | Permisos |
|---|---|---|
| **Estudiante** | Normal | Catálogo, préstamos, PDF con préstamo activo, mensajería, perfil |
| **Docente** | Normal | Igual que Estudiante |
| **Administrador** | Normal | Todo lo anterior + gestión de usuarios, libros, reportes |
| **Administrador** | Principal | Todo lo anterior + designar/revocar admins, resolver solicitudes, revocar con restauración de rol |

---

## 🔐 Seguridad

### JWT
Token con 4 claims: `id`, `rol`, `jerarquia`, `nombre`. Vigencia de 8 horas.

### Recuperación de contraseña — 2 pasos
- **Paso 1** — cédula → código `XXXX-XXXX`, expira 15 minutos
- **Paso 2** — código + nueva contraseña → actualiza hash BCrypt

### Acceso controlado a PDFs
- Upload directo del navegador a Cloudinary con firma SHA1 generada por el servidor
- La URL real de Cloudinary nunca se expone — el endpoint devuelve la URL solo con préstamo activo
- Al devolver el libro, el acceso queda revocado automáticamente

### Prevención XSS
Todos los datos del servidor pasan por `esc()` antes de insertarse en el DOM.

---

## 💬 Mensajería en tiempo real

### Eventos SignalR

| Evento | Descripción |
|---|---|
| `NuevoMensaje` | Notificación con foto, nombre y preview |
| `MensajesLeidos` | Confirmación de lectura (✓✓) |
| `UsuarioEscribiendo` | Indicador animado "está escribiendo..." |
| `UsuarioDejoDeEscribir` | Oculta el indicador |
| `UsuarioConectado` | Actualiza punto verde de presencia online |
| `UsuarioDesconectado` | Quita punto verde |
| `NotificacionPrestamo` | Alerta persistente de préstamo próximo a vencer |
| `NotificacionSolicitud` | Alerta de solicitud de admin aprobada/rechazada |

### Funcionalidades de mensajería
- Chat en tiempo real entre todos los roles
- Editar mensaje propio (inline sin recargar)
- Eliminar mensaje propio para todos
- Eliminar mensaje recibido solo para mí
- Eliminar conversación completa solo para mí
- Indicador de presencia online en tiempo real
- Badge de mensajes no leídos en el nav

---

## 🔔 Notificaciones persistentes

Aparecen en la esquina superior derecha y no desaparecen hasta que el usuario las cierra:

- **⏰ Préstamo por vencer** — cuando faltan menos de 24 horas
- **🚨 Préstamo urgente** — cuando faltan menos de 12 horas
- **⭐ Solicitud aprobada** — notificación inmediata al usuario
- **❌ Solicitud rechazada** — notificación inmediata al usuario
- Se cierran automáticamente al devolver el libro correspondiente

---

## ⚙️ Sanción automática

`SancionAutomaticaService` corre cada hora en segundo plano:

1. Marca préstamos con `FechaDevolucion < ahora` como `"Vencido"`
2. Sanciona automáticamente usuarios con préstamos vencidos (excepto Administradores)
3. Reactiva automáticamente usuarios sancionados que devolvieron todos sus préstamos

---

## 🌐 Endpoints de la API

### Usuarios — `/api/Usuarios`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/registrar` | No | Crear cuenta |
| POST | `/login` | No | Iniciar sesión |
| GET | `/primer-registro` | No | Verificar si existe Admin Principal |
| POST | `/solicitar-recuperacion` | No | Paso 1 recuperación |
| POST | `/recuperar` | No | Paso 2 recuperación |
| POST | `/cambiar-password` | JWT | Cambiar contraseña |
| PUT | `/perfil` | JWT | Actualizar descripción |
| POST | `/foto` | JWT | Subir foto de perfil |
| DELETE | `/foto` | JWT | Eliminar foto |
| GET | `/` | JWT | Listar usuarios |
| GET | `/{id}/perfil` | JWT | Ver perfil público |
| PUT | `/{id}/estado` | JWT + Admin | Cambiar estado |
| PUT | `/{id}/rol` | JWT + Admin Principal | Designar/revocar admin (restaura rol anterior) |
| POST | `/solicitar-admin` | JWT | Solicitar privilegios |
| GET | `/solicitudes-admin` | JWT + Admin Principal | Ver solicitudes |
| PUT | `/solicitudes-admin/{id}` | JWT + Admin Principal | Aprobar/rechazar |
| DELETE | `/{id}` | JWT | Eliminar cuenta |

### Libros — `/api/Libros`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/` | JWT | Catálogo (sin PDF URL) |
| GET | `/{id}` | JWT | Detalle |
| GET | `/categoria/{categoria}` | JWT | Filtrar |
| GET | `/categorias/lista` | JWT | Categorías únicas |
| POST | `/` | JWT + Admin | Registrar libro |
| PUT | `/{id}` | JWT + Admin | Editar libro |
| POST | `/{id}/portada` | JWT + Admin | Subir portada |
| DELETE | `/{id}/portada` | JWT + Admin | Eliminar portada |
| GET | `/{id}/pdf-signature` | JWT + Admin | Firma para upload directo |
| POST | `/{id}/pdf-confirmar` | JWT + Admin | Confirmar URL tras upload |
| DELETE | `/{id}/pdf` | JWT + Admin | Eliminar PDF |
| DELETE | `/{id}` | JWT + Admin | Eliminar libro |

### Préstamos — `/api/Prestamos`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/solicitar` | JWT | Solicitar préstamo |
| PUT | `/devolver/{id}` | JWT | Registrar devolución |
| GET | `/pdf/{prestamoId}` | JWT | Obtener URL PDF (solo préstamo activo) |
| GET | `/mis-prestamos` | JWT | Historial propio |
| GET | `/activos` | JWT + Admin | Todos los activos |
| GET | `/historial` | JWT + Admin | Historial con fechas |
| GET | `/estadisticas` | JWT + Admin | Estadísticas generales |

### Mensajes — `/api/Mensajes`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/` | JWT | Enviar mensaje |
| GET | `/conversacion/{id}` | JWT | Obtener conversación |
| GET | `/conversaciones` | JWT | Inbox |
| GET | `/no-leidos` | JWT | Conteo badge |
| PUT | `/{id}` | JWT | Editar mensaje propio |
| DELETE | `/{id}` | JWT | Eliminar mensaje |
| DELETE | `/conversacion/{id}` | JWT | Eliminar conversación |

---

## 🗄️ Modelo de datos

```
usuarios
├── id, nombre, usuario_login UNIQUE, password (BCrypt)
├── cedula UNIQUE, correo UNIQUE
├── tipo_rol ('Estudiante'|'Docente'|'Administrador')
├── jerarquia ('Principal'|'Normal')
├── estado ('Activo'|'Sancionado'|'Inactivo')
├── descripcion, foto_url, foto_public_id
├── rol_anterior                   ← rol antes de ser Admin
└── fecha_registro

codigos_recuperacion
├── id, usuario_id FK, codigo (XXXX-XXXX)
└── expiracion (UTC+15min), usado

solicitudes_admin
├── id, usuario_id FK, mensaje
├── estado ('Pendiente'|'Aprobada'|'Rechazada')
└── fecha_solicitud, fecha_resolucion

libros
├── id, titulo, autor, isbn UNIQUE
├── editorial, anio, categoria, cantidad (≥0)
├── sinopsis
├── imagen, imagen_public_id       ← Cloudinary
└── pdf_url, pdf_public_id         ← Cloudinary

prestamos
├── id, usuario_id FK, libro_id FK
├── fecha_prestamo, fecha_devolucion (UTC)
├── estado ('Activo'|'Devuelto'|'Vencido')
└── referencia UNIQUE (BS-AAAAMMDD-XXXXXX)

mensajes
├── id, remitente_id FK, receptor_id FK
├── contenido, leido
└── fecha_envio
```

---

## 📦 Dependencias

```xml
Microsoft.EntityFrameworkCore                   8.0.0
Microsoft.EntityFrameworkCore.Design            8.0.0
Pomelo.EntityFrameworkCore.MySql                8.0.0
Microsoft.AspNetCore.Authentication.JwtBearer   8.0.0
System.IdentityModel.Tokens.Jwt                 7.3.1
BCrypt.Net-Next                                 4.0.3
Microsoft.AspNetCore.SignalR                    1.1.0
CloudinaryDotNet                                1.26.2
```

---

## ☁️ Variables de entorno en Railway

```
ConnectionStrings__DefaultConnection = server=mysql.railway.internal;port=3306;database=railway;user=root;password=...
Jwt__Secret                          = TU_CLAVE_SECRETA
Prestamo__DiasPlazo                  = 8
Cloudinary__CloudName                = tu_cloud_name
Cloudinary__ApiKey                   = tu_api_key
Cloudinary__ApiSecret                = tu_api_secret
```

---

## 🛠️ Solución de problemas

| Problema | Solución |
|---|---|
| SignalR no conecta | Verificar que el token se pase en `?access_token=` |
| PDF da error 401 | Activar "Allow delivery of PDF and ZIP files" en Cloudinary Security |
| PDF muy grande | Plan gratuito de Cloudinary tiene límite de 10 MB por archivo raw |
| Foto no sube | Verificar credenciales Cloudinary en `appsettings.json` |
| Error 403 | Verificar claims `rol` y `jerarquia` en el token |
| Sesión expira al registrarse | Normal — el token está vacío, no hay sesión que cerrar |
| Sanción no se aplica | El servicio corre cada hora — esperar el siguiente ciclo |

---

## 🔄 Novedades v2.0 vs v1.0

| Módulo | Novedad |
|---|---|
| **Mensajería** | Chat en tiempo real, editar/eliminar mensajes, eliminar conversación |
| **Presencia** | Indicadores de usuarios online en tiempo real |
| **Perfiles** | Foto en Cloudinary, descripción personal, vista pública |
| **PDFs** | Upload directo a Cloudinary con firma, visor en nueva pestaña |
| **Notificaciones** | Persistentes para préstamos por vencer y solicitudes admin |
| **Sanción** | Automática cada hora con reactivación al devolver |
| **Jerarquía** | Admin Principal + Normal, solicitudes, revocación con rol anterior |
| **Catálogo** | Sinopsis, popover de detalle, badge PDF, imágenes adaptativas |
| **Cloudinary** | Fotos, portadas y PDFs — resuelve sistema efímero de Railway |
| **BD** | 6 tablas, 13 índices, sin datos semilla, catálogo vacío |

---

*BiblioSync v2.0 — Desarrollado para instituciones educativas del departamento de Atlántico*
