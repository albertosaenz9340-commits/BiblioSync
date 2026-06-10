using BiblioSync.Data;
using BiblioSync.DTOs;
using BiblioSync.Models;
using BiblioSync.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace BiblioSync.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MensajesController : ControllerBase
    {
        private readonly AppDbContext              _context;
        private readonly IHubContext<ChatHub>      _hubContext;

        public MensajesController(
            AppDbContext context,
            IHubContext<ChatHub> hubContext)
        {
            _context    = context;
            _hubContext = hubContext;
        }

        private int ObtenerIdToken() =>
            int.Parse(User.FindFirst("id")!.Value);

        // =====================================================
        // POST /api/Mensajes
        // Enviar mensaje a otro usuario
        // Dispara notificación SignalR en tiempo real
        // =====================================================
        [HttpPost]
        public async Task<IActionResult> EnviarMensaje([FromBody] MensajeDTO dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos" });

            var remitenteId = ObtenerIdToken();

            if (remitenteId == dto.ReceptorId)
                return BadRequest(new { success = false, message = "No puedes enviarte mensajes a ti mismo" });

            var remitente = await _context.Usuarios.FindAsync(remitenteId);
            var receptor  = await _context.Usuarios.FindAsync(dto.ReceptorId);

            if (remitente == null)
                return NotFound(new { success = false, message = "Remitente no encontrado" });

            if (receptor == null)
                return NotFound(new { success = false, message = "Usuario receptor no encontrado" });

            if (receptor.Estado == "Inactivo")
                return BadRequest(new { success = false, message = "No puedes enviar mensajes a una cuenta inactiva" });

            var mensaje = new Mensaje
            {
                RemitenteId = remitenteId,
                ReceptorId  = dto.ReceptorId,
                Contenido   = dto.Contenido.Trim(),
                Leido       = false,
                FechaEnvio  = DateTime.UtcNow
            };

            _context.Mensajes.Add(mensaje);
            await _context.SaveChangesAsync();

            // ---- NOTIFICACIÓN SIGNALR EN TIEMPO REAL ----
            // Envía al grupo del receptor (si está conectado)
            var preview = mensaje.Contenido.Length > 60
                ? mensaje.Contenido[..60] + "..."
                : mensaje.Contenido;

            await _hubContext.Clients
                .Group($"usuario_{dto.ReceptorId}")
                .SendAsync("NuevoMensaje", new
                {
                    mensajeId   = mensaje.Id,
                    remitenteId = remitenteId,
                    nombre      = remitente.Nombre,
                    fotoUrl     = remitente.FotoUrl,
                    preview,
                    fechaEnvio  = mensaje.FechaEnvio
                });

            return Ok(new
            {
                success   = true,
                message   = "Mensaje enviado",
                mensajeId = mensaje.Id,
                fechaEnvio = mensaje.FechaEnvio
            });
        }

        // =====================================================
        // GET /api/Mensajes/conversacion/{otroUsuarioId}
        // Obtener mensajes entre el usuario actual y otro
        // Marca automáticamente como leídos los recibidos
        // =====================================================
        [HttpGet("conversacion/{otroUsuarioId}")]
        public async Task<IActionResult> ObtenerConversacion(int otroUsuarioId)
        {
            var miId = ObtenerIdToken();

            // Verificar que el otro usuario existe
            var otroUsuario = await _context.Usuarios
                .Where(u => u.Id == otroUsuarioId)
                .Select(u => new { u.Id, u.Nombre, u.FotoUrl, u.TipoRol, u.Jerarquia })
                .FirstOrDefaultAsync();

            if (otroUsuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            // Obtener mensajes de ambas direcciones ordenados por fecha
            var prefijo = $"[OCULTO:{miId}]";

            var mensajes = await _context.Mensajes
                .Where(m =>
                    ((m.RemitenteId == miId       && m.ReceptorId  == otroUsuarioId) ||
                     (m.RemitenteId == otroUsuarioId && m.ReceptorId == miId)) &&
                    !m.Contenido.StartsWith(prefijo))  // Filtrar mensajes ocultos para este usuario
                .OrderBy(m => m.FechaEnvio)
                .Select(m => new
                {
                    m.Id,
                    m.RemitenteId,
                    m.ReceptorId,
                    // Limpiar prefijos de ocultado del otro usuario antes de enviar
                    Contenido = m.Contenido.StartsWith("[OCULTO:") && !m.Contenido.StartsWith(prefijo)
                        ? m.Contenido.Substring(m.Contenido.IndexOf("]") + 1)
                        : m.Contenido,
                    m.Leido,
                    m.FechaEnvio,
                    esMio = m.RemitenteId == miId
                })
                .ToListAsync();

            // Marcar como leídos los mensajes recibidos no leídos
            var noLeidos = await _context.Mensajes
                .Where(m =>
                    m.RemitenteId == otroUsuarioId &&
                    m.ReceptorId  == miId          &&
                    !m.Leido)
                .ToListAsync();

            if (noLeidos.Any())
            {
                noLeidos.ForEach(m => m.Leido = true);
                await _context.SaveChangesAsync();

                // Notificar al remitente que sus mensajes fueron leídos
                await _hubContext.Clients
                    .Group($"usuario_{otroUsuarioId}")
                    .SendAsync("MensajesLeidos", new { leidosPor = miId });
            }

            return Ok(new { success = true, otroUsuario, mensajes });
        }

        // =====================================================
        // GET /api/Mensajes/conversaciones
        // Lista de conversaciones del usuario — estilo inbox
        // Muestra el último mensaje de cada conversación
        // y cuántos no leídos hay
        // =====================================================
        [HttpGet("conversaciones")]
        public async Task<IActionResult> ObtenerConversaciones()
        {
            var miId = ObtenerIdToken();

            var prefijo = $"[OCULTO:{miId}]";

            // IDs de usuarios con quienes tengo mensajes NO ocultos para mí
            var idsConversaciones = await _context.Mensajes
                .Where(m =>
                    (m.RemitenteId == miId || m.ReceptorId == miId) &&
                    !m.Contenido.StartsWith(prefijo))
                .Select(m => m.RemitenteId == miId ? m.ReceptorId : m.RemitenteId)
                .Distinct()
                .ToListAsync();

            var conversaciones = new List<object>();

            foreach (var otroId in idsConversaciones)
            {
                var otroUsuario = await _context.Usuarios
                    .Where(u => u.Id == otroId)
                    .Select(u => new { u.Id, u.Nombre, u.FotoUrl, u.TipoRol, u.Jerarquia })
                    .FirstOrDefaultAsync();

                if (otroUsuario == null) continue;

                // Último mensaje de la conversación — excluir ocultos para este usuario
                var ultimoMensaje = await _context.Mensajes
                    .Where(m =>
                        ((m.RemitenteId == miId  && m.ReceptorId  == otroId) ||
                         (m.RemitenteId == otroId && m.ReceptorId == miId)) &&
                        !m.Contenido.StartsWith(prefijo))
                    .OrderByDescending(m => m.FechaEnvio)
                    .Select(m => new
                    {
                        m.Id,
                        m.Contenido,
                        m.FechaEnvio,
                        m.RemitenteId,
                        esMio = m.RemitenteId == miId
                    })
                    .FirstOrDefaultAsync();

                // Mensajes no leídos recibidos de este usuario
                var noLeidos = await _context.Mensajes
                    .CountAsync(m =>
                        m.RemitenteId == otroId &&
                        m.ReceptorId  == miId   &&
                        !m.Leido);

                conversaciones.Add(new
                {
                    usuario      = otroUsuario,
                    ultimoMensaje,
                    noLeidos
                });
            }

            // Ordenar por fecha del último mensaje descendente
            var ordenadas = conversaciones
                .OrderByDescending(c =>
                {
                    var tipo = c.GetType();
                    var prop = tipo.GetProperty("ultimoMensaje")?.GetValue(c);
                    if (prop == null) return DateTime.MinValue;
                    var fechaProp = prop.GetType().GetProperty("FechaEnvio")?.GetValue(prop);
                    return fechaProp is DateTime dt ? dt : DateTime.MinValue;
                })
                .ToList();

            return Ok(new { success = true, conversaciones = ordenadas });
        }

        // =====================================================
        // GET /api/Mensajes/no-leidos
        // Conteo total de mensajes no leídos del usuario
        // Usado para el badge del nav de mensajería
        // =====================================================
        [HttpGet("no-leidos")]
        public async Task<IActionResult> ContarNoLeidos()
        {
            var miId     = ObtenerIdToken();
            var cantidad = await _context.Mensajes
                .CountAsync(m => m.ReceptorId == miId && !m.Leido);

            return Ok(new { success = true, cantidad });
        }

        // =====================================================
        // PUT /api/Mensajes/{id}
        // Editar mensaje propio
        // =====================================================
        [HttpPut("{id}")]
        public async Task<IActionResult> EditarMensaje(int id, [FromBody] MensajeDTO dto)
        {
            var miId    = ObtenerIdToken();
            var mensaje = await _context.Mensajes.FindAsync(id);

            if (mensaje == null)
                return NotFound(new { success = false, message = "Mensaje no encontrado" });

            if (mensaje.RemitenteId != miId)
                return Forbid();

            if (string.IsNullOrWhiteSpace(dto.Contenido))
                return BadRequest(new { success = false, message = "El contenido no puede estar vacío" });

            mensaje.Contenido = dto.Contenido.Trim();
            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "Mensaje editado" });
        }

        // =====================================================
        // DELETE /api/Mensajes/{id}
        // Eliminar mensaje — solo el remitente elimina para todos
        // Cualquier participante puede ocultar un mensaje para sí
        // =====================================================
        [HttpDelete("{id}")]
        public async Task<IActionResult> EliminarMensaje(int id, [FromQuery] bool soloParaMi = false)
        {
            var miId    = ObtenerIdToken();
            var mensaje = await _context.Mensajes.FindAsync(id);

            if (mensaje == null)
                return NotFound(new { success = false, message = "Mensaje no encontrado" });

            var esRemitente = mensaje.RemitenteId == miId;
            var esReceptor  = mensaje.ReceptorId  == miId;

            if (!esRemitente && !esReceptor)
                return Forbid();

            if (soloParaMi)
            {
                // Ocultar solo para este usuario — marcar en el contenido con prefijo especial
                // Si ya fue ocultado por el otro lado, eliminar físicamente
                var prefijo = $"[OCULTO:{miId}]";
                if (mensaje.Contenido.Contains($"[OCULTO:{mensaje.RemitenteId}]") ||
                    mensaje.Contenido.Contains($"[OCULTO:{mensaje.ReceptorId}]"))
                {
                    // Ambos lo ocultaron — eliminar físicamente
                    _context.Mensajes.Remove(mensaje);
                }
                else
                {
                    mensaje.Contenido = prefijo + mensaje.Contenido;
                }
            }
            else
            {
                // Solo el remitente puede eliminar para todos
                if (!esRemitente)
                    return Forbid();

                _context.Mensajes.Remove(mensaje);
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "Mensaje eliminado" });
        }

        // =====================================================
        // DELETE /api/Mensajes/conversacion/{otroUsuarioId}
        // Eliminar toda la conversación solo para el usuario actual
        // =====================================================
        [HttpDelete("conversacion/{otroUsuarioId}")]
        public async Task<IActionResult> EliminarConversacion(int otroUsuarioId)
        {
            var miId = ObtenerIdToken();

            var mensajes = await _context.Mensajes
                .Where(m =>
                    (m.RemitenteId == miId       && m.ReceptorId  == otroUsuarioId) ||
                    (m.RemitenteId == otroUsuarioId && m.ReceptorId == miId))
                .ToListAsync();

            if (!mensajes.Any())
                return Ok(new { success = true, message = "Conversación vacía" });

            var prefijo = $"[OCULTO:{miId}]";

            foreach (var m in mensajes)
            {
                // Si el otro ya ocultó este mensaje, eliminarlo físicamente
                var otroId = m.RemitenteId == miId ? m.ReceptorId : m.RemitenteId;
                if (m.Contenido.Contains($"[OCULTO:{otroId}]"))
                {
                    _context.Mensajes.Remove(m);
                }
                else if (!m.Contenido.StartsWith(prefijo))
                {
                    m.Contenido = prefijo + m.Contenido;
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "Conversación eliminada" });
        }
    }
}
