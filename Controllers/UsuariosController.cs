using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BiblioSync.Data;
using BiblioSync.DTOs;
using BiblioSync.Hubs;
using BiblioSync.Models;
using BiblioSync.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BiblioSync.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsuariosController : ControllerBase
    {
        private readonly AppDbContext         _context;
        private readonly IConfiguration      _config;
        private readonly CloudinaryService   _cloudinary;
        private readonly IHubContext<ChatHub> _hubContext;

        public UsuariosController(
            AppDbContext context,
            IConfiguration config,
            CloudinaryService cloudinary,
            IHubContext<ChatHub> hubContext)
        {
            _context    = context;
            _config     = config;
            _cloudinary = cloudinary;
            _hubContext = hubContext;
        }

        // =====================================================
        // HELPERS PRIVADOS
        // =====================================================

        private string GenerarToken(Usuario usuario)
        {
            var secret = _config["Jwt:Secret"]!;
            var key    = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
            var creds  = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim("id",        usuario.Id.ToString()),
                new Claim("rol",       usuario.TipoRol),
                new Claim("jerarquia", usuario.Jerarquia),
                new Claim("nombre",    usuario.Nombre)
            };

            var token = new JwtSecurityToken(
                claims:             claims,
                expires:            DateTime.UtcNow.AddHours(8),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private static string GenerarCodigoRecuperacion()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            var bytes  = RandomNumberGenerator.GetBytes(8);
            var parte1 = new string(bytes[..4].Select(b => chars[b % chars.Length]).ToArray());
            var parte2 = new string(bytes[4..].Select(b => chars[b % chars.Length]).ToArray());
            return $"{parte1}-{parte2}";
        }

        private int ObtenerIdToken() =>
            int.Parse(User.FindFirst("id")!.Value);

        private string ObtenerRolToken() =>
            User.FindFirst("rol")?.Value ?? "";

        private string ObtenerJerarquiaToken() =>
            User.FindFirst("jerarquia")?.Value ?? "Normal";

        private bool EsAdminPrincipal() =>
            ObtenerRolToken() == "Administrador" && ObtenerJerarquiaToken() == "Principal";

        // =====================================================
        // GET /api/Usuarios/primer-registro
        // Abierto — indica si ya existe un Admin Principal real
        // Verdadero mientras no haya ningún usuario con
        // jerarquia = 'Principal' y usuarioLogin != 'admin'
        // =====================================================
        [HttpGet("primer-registro")]
        public IActionResult EsPrimerRegistro()
        {
            // Hay Admin Principal real si existe alguien con jerarquia Principal
            // que NO sea el admin semilla del sistema
            var hayAdminPrincipalReal = _context.Usuarios.Any(u =>
                u.Jerarquia    == "Principal" &&
                u.UsuarioLogin != "admin");

            return Ok(new { esPrimero = !hayAdminPrincipalReal });
        }

        // =====================================================
        // POST /api/Usuarios/registrar
        // Abierto — Estudiante o Docente públicamente.
        // Primer usuario real puede registrarse como Admin Principal.
        // =====================================================
        [HttpPost("registrar")]
        public IActionResult Registrar([FromBody] RegistroDTO dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos", errores = ModelState });

            var rolSolicitado = dto.TipoRol?.Trim();
            var jerarquiaFinal = "Normal";

            if (rolSolicitado == "Administrador")
            {
                // Verificar si viene del flujo de primer registro (esPrincipal = true)
                if (dto.EsPrincipal)
                {
                    // Solo permitido si no existe aún un Admin Principal real
                    var hayAdminPrincipalReal = _context.Usuarios.Any(u =>
                        u.Jerarquia    == "Principal" &&
                        u.UsuarioLogin != "admin");
                    if (hayAdminPrincipalReal)
                        return BadRequest(new { success = false, message = "Ya existe un Administrador Principal registrado." });
                    jerarquiaFinal = "Principal";
                }
                else
                {
                    // Registro normal de admin — requiere token de admin
                    var rolToken = User.FindFirst("rol")?.Value;
                    if (rolToken != "Administrador")
                        return Forbid();
                }
            }

            var rolFinal = rolSolicitado is "Estudiante" or "Docente" or "Administrador"
                ? rolSolicitado : "Estudiante";

            var existe = _context.Usuarios.Any(x =>
                x.UsuarioLogin == dto.Cedula ||
                x.Cedula       == dto.Cedula ||
                x.Correo       == dto.Correo.Trim().ToLower());

            if (existe)
                return BadRequest(new { success = false, message = "La cédula o correo ya están registrados" });

            var usuario = new Usuario
            {
                Nombre       = dto.Nombre.Trim(),
                UsuarioLogin = dto.Cedula.Trim(),
                Password     = BCrypt.Net.BCrypt.HashPassword(dto.Password),
                Cedula       = dto.Cedula.Trim(),
                Correo       = dto.Correo.Trim().ToLower(),
                TipoRol      = rolFinal,
                Jerarquia    = jerarquiaFinal,
                Estado       = "Activo"
            };

            _context.Usuarios.Add(usuario);
            _context.SaveChanges();

            return Ok(new { success = true, message = "Usuario registrado exitosamente" });
        }

        // =====================================================
        // POST /api/Usuarios/login
        // =====================================================
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginDTO dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos" });

            var usuario = _context.Usuarios
                .FirstOrDefault(x => x.UsuarioLogin == dto.Usuario);

            if (usuario == null || !BCrypt.Net.BCrypt.Verify(dto.Password, usuario.Password))
                return BadRequest(new { success = false, message = "Credenciales incorrectas" });

            if (usuario.Estado == "Inactivo")
                return BadRequest(new { success = false, message = "Tu cuenta está inactiva. Contacta al administrador." });

            if (usuario.Estado == "Sancionado")
                return BadRequest(new { success = false, message = "Tu cuenta está sancionada por préstamos vencidos." });

            return Ok(new
            {
                success = true,
                token   = GenerarToken(usuario),
                usuario = new
                {
                    usuario.Id,
                    usuario.Nombre,
                    usuario.Cedula,
                    usuario.Correo,
                    usuario.TipoRol,
                    usuario.Jerarquia,
                    usuario.Estado,
                    usuario.Descripcion,
                    usuario.FotoUrl,
                    Usuario = usuario.UsuarioLogin
                }
            });
        }

        // =====================================================
        // POST /api/Usuarios/solicitar-recuperacion
        // =====================================================
        [HttpPost("solicitar-recuperacion")]
        public IActionResult SolicitarRecuperacion([FromBody] SolicitudRecuperacionDTO dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos" });

            var usuario = _context.Usuarios
                .FirstOrDefault(x => x.Cedula == dto.Cedula);

            if (usuario == null)
                return Ok(new { success = true, message = "Si la cédula existe, el código fue generado." });

            var anteriores = _context.CodigosRecuperacion
                .Where(x => x.UsuarioId == usuario.Id && !x.Usado);
            _context.CodigosRecuperacion.RemoveRange(anteriores);

            var codigo = GenerarCodigoRecuperacion();

            _context.CodigosRecuperacion.Add(new CodigoRecuperacion
            {
                UsuarioId  = usuario.Id,
                Codigo     = codigo,
                Expiracion = DateTime.UtcNow.AddMinutes(15),
                Usado      = false
            });
            _context.SaveChanges();

            return Ok(new
            {
                success = true,
                message = "Código generado. Tienes 15 minutos para usarlo.",
                codigo  // QUITAR en producción — reemplazar por email
            });
        }

        // =====================================================
        // POST /api/Usuarios/recuperar
        // =====================================================
        [HttpPost("recuperar")]
        public IActionResult Recuperar([FromBody] RecuperarPasswordDTO dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos" });

            var usuario = _context.Usuarios
                .FirstOrDefault(x => x.Cedula == dto.Cedula);

            if (usuario == null)
                return BadRequest(new { success = false, message = "Cédula no encontrada" });

            var registro = _context.CodigosRecuperacion.FirstOrDefault(x =>
                x.UsuarioId  == usuario.Id              &&
                x.Codigo     == dto.Codigo.ToUpper().Trim() &&
                !x.Usado                                &&
                x.Expiracion >  DateTime.UtcNow);

            if (registro == null)
                return BadRequest(new { success = false, message = "Código inválido o expirado" });

            usuario.Password = BCrypt.Net.BCrypt.HashPassword(dto.NuevaPassword);
            registro.Usado   = true;
            _context.SaveChanges();

            return Ok(new { success = true, message = "Contraseña actualizada correctamente" });
        }

        // =====================================================
        // POST /api/Usuarios/cambiar-password
        // [Authorize] — requiere token + contraseña actual
        // =====================================================
        [HttpPost("cambiar-password")]
        [Authorize]
        public IActionResult CambiarPassword([FromBody] CambioPasswordDTO dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos" });

            var usuario = _context.Usuarios.Find(ObtenerIdToken());
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            if (!BCrypt.Net.BCrypt.Verify(dto.PasswordActual, usuario.Password))
                return BadRequest(new { success = false, message = "La contraseña actual es incorrecta" });

            usuario.Password = BCrypt.Net.BCrypt.HashPassword(dto.NuevaPassword);
            _context.SaveChanges();

            return Ok(new { success = true, message = "Contraseña actualizada correctamente" });
        }

        // =====================================================
        // PUT /api/Usuarios/perfil
        // [Authorize] — actualiza descripción personal
        // =====================================================
        [HttpPut("perfil")]
        [Authorize]
        public IActionResult ActualizarPerfil([FromBody] PerfilDTO dto)
        {
            var usuario = _context.Usuarios.Find(ObtenerIdToken());
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            usuario.Descripcion = dto.Descripcion.Trim();
            _context.SaveChanges();

            return Ok(new { success = true, message = "Perfil actualizado" });
        }

        // =====================================================
        // POST /api/Usuarios/foto
        // [Authorize] — subir o actualizar foto de perfil
        // =====================================================
        [HttpPost("foto")]
        [Authorize]
        public async Task<IActionResult> SubirFoto(IFormFile foto)
        {
            var usuario = _context.Usuarios.Find(ObtenerIdToken());
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            try
            {
                // Eliminar foto anterior si existe
                if (!string.IsNullOrEmpty(usuario.FotoPublicId))
                    await _cloudinary.EliminarAsync(usuario.FotoPublicId);

                var (url, publicId) = await _cloudinary.SubirFotoPerfilAsync(foto);

                usuario.FotoUrl      = url;
                usuario.FotoPublicId = publicId;
                _context.SaveChanges();

                return Ok(new { success = true, fotoUrl = url, message = "Foto actualizada" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
        }

        // =====================================================
        // DELETE /api/Usuarios/foto
        // [Authorize] — eliminar foto de perfil
        // =====================================================
        [HttpDelete("foto")]
        [Authorize]
        public async Task<IActionResult> EliminarFoto()
        {
            var usuario = _context.Usuarios.Find(ObtenerIdToken());
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            if (!string.IsNullOrEmpty(usuario.FotoPublicId))
                await _cloudinary.EliminarAsync(usuario.FotoPublicId);

            usuario.FotoUrl      = string.Empty;
            usuario.FotoPublicId = string.Empty;
            _context.SaveChanges();

            return Ok(new { success = true, message = "Foto eliminada" });
        }

        // =====================================================
        // GET /api/Usuarios
        // [Authorize] — lista usuarios (Admin ve todos,
        // otros ven solo nombre, foto y rol para mensajería)
        // =====================================================
        [HttpGet]
        [Authorize]
        public IActionResult ListarUsuarios([FromQuery] string? buscar = null)
        {
            var rol = ObtenerRolToken();

            if (rol == "Administrador")
            {
                var query = _context.Usuarios.AsQueryable();

                if (!string.IsNullOrWhiteSpace(buscar))
                    query = query.Where(u =>
                        u.Nombre.Contains(buscar) ||
                        u.Cedula.Contains(buscar) ||
                        u.Correo.Contains(buscar));

                var usuarios = query
                    .OrderBy(u => u.Nombre)
                    .Select(u => new
                    {
                        u.Id, u.Nombre, u.Cedula, u.Correo,
                        u.TipoRol, u.Jerarquia, u.Estado,
                        u.FotoUrl, u.FechaRegistro
                    })
                    .ToList();

                return Ok(new { success = true, usuarios });
            }
            else
            {
                // Estudiantes y docentes ven lista reducida para mensajería
                var query = _context.Usuarios
                    .Where(u => u.Estado == "Activo")
                    .AsQueryable();

                if (!string.IsNullOrWhiteSpace(buscar))
                    query = query.Where(u => u.Nombre.Contains(buscar));

                var usuarios = query
                    .OrderBy(u => u.Nombre)
                    .Select(u => new
                    {
                        u.Id,
                        u.Nombre,
                        u.TipoRol,
                        u.Jerarquia,
                        u.FotoUrl
                    })
                    .ToList();

                return Ok(new { success = true, usuarios });
            }
        }

        // =====================================================
        // GET /api/Usuarios/{id}/perfil
        // [Authorize] — ver perfil público de un usuario
        // =====================================================
        [HttpGet("{id}/perfil")]
        [Authorize]
        public IActionResult VerPerfil(int id)
        {
            var usuario = _context.Usuarios
                .Where(u => u.Id == id)
                .Select(u => new
                {
                    u.Id,
                    u.Nombre,
                    u.TipoRol,
                    u.Jerarquia,
                    u.Descripcion,
                    u.FotoUrl,
                    u.FechaRegistro
                })
                .FirstOrDefault();

            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            return Ok(new { success = true, usuario });
        }

        // =====================================================
        // PUT /api/Usuarios/{id}/estado
        // [Authorize] — solo Administrador
        // =====================================================
        [HttpPut("{id}/estado")]
        [Authorize]
        public IActionResult CambiarEstado(int id, [FromBody] CambioEstadoDTO dto)
        {
            if (ObtenerRolToken() != "Administrador")
                return Forbid();

            var usuario = _context.Usuarios.Find(id);
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            var estadosValidos = new[] { "Activo", "Sancionado", "Inactivo" };
            if (!estadosValidos.Contains(dto.Estado))
                return BadRequest(new { success = false, message = "Estado inválido" });

            usuario.Estado = dto.Estado;
            _context.SaveChanges();

            return Ok(new { success = true, message = $"Estado actualizado a {dto.Estado}" });
        }

        // =====================================================
        // PUT /api/Usuarios/{id}/rol
        // [Authorize] — solo Admin Principal puede
        // designar o revocar privilegios admin
        // =====================================================
        [HttpPut("{id}/rol")]
        [Authorize]
        public IActionResult CambiarRol(int id, [FromBody] CambioRolDTO dto)
        {
            if (!EsAdminPrincipal())
                return Forbid();

            var usuario = _context.Usuarios.Find(id);
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            // No se puede cambiar el rol del Admin Principal
            if (usuario.Jerarquia == "Principal")
                return BadRequest(new { success = false, message = "No se puede modificar el rol del Administrador Principal" });

            var rolesValidos = new[] { "Estudiante", "Docente", "Administrador" };
            if (!rolesValidos.Contains(dto.TipoRol))
                return BadRequest(new { success = false, message = "Rol inválido" });

            if (dto.TipoRol == "Administrador")
            {
                // Guardar el rol actual antes de promover
                usuario.RolAnterior = usuario.TipoRol;
                usuario.TipoRol     = "Administrador";
                usuario.Jerarquia   = "Normal";

                // Aprobar solicitud pendiente si existe
                var solicitud = _context.SolicitudesAdmin
                    .FirstOrDefault(s => s.UsuarioId == id && s.Estado == "Pendiente");
                if (solicitud != null)
                {
                    solicitud.Estado          = "Aprobada";
                    solicitud.FechaResolucion = DateTime.UtcNow;
                }
            }
            else
            {
                // Revocar — restaurar el rol anterior guardado
                var rolRestaurar = string.IsNullOrEmpty(usuario.RolAnterior) || usuario.RolAnterior == "Administrador"
                    ? "Estudiante"
                    : usuario.RolAnterior;

                usuario.TipoRol    = rolRestaurar;
                usuario.Jerarquia  = "Normal";
                usuario.RolAnterior = rolRestaurar;
            }

            _context.SaveChanges();

            var mensaje = dto.TipoRol == "Administrador"
                ? $"Usuario promovido a Administrador."
                : $"Privilegios revocados. El usuario vuelve a ser {usuario.TipoRol}.";

            return Ok(new { success = true, message = mensaje });
        }

        // =====================================================
        // POST /api/Usuarios/solicitar-admin
        // [Authorize] — cualquier usuario puede solicitar
        // =====================================================
        [HttpPost("solicitar-admin")]
        [Authorize]
        public IActionResult SolicitarAdmin([FromBody] SolicitudAdminDTO dto)
        {
            var idToken = ObtenerIdToken();
            var usuario = _context.Usuarios.Find(idToken);

            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            if (usuario.TipoRol == "Administrador")
                return BadRequest(new { success = false, message = "Ya tienes privilegios de administrador" });

            // Verificar que no tenga una solicitud pendiente
            var pendiente = _context.SolicitudesAdmin
                .Any(s => s.UsuarioId == idToken && s.Estado == "Pendiente");

            if (pendiente)
                return BadRequest(new { success = false, message = "Ya tienes una solicitud pendiente de revisión" });

            _context.SolicitudesAdmin.Add(new SolicitudAdmin
            {
                UsuarioId      = idToken,
                Mensaje        = dto.Mensaje.Trim(),
                Estado         = "Pendiente",
                FechaSolicitud = DateTime.UtcNow
            });
            _context.SaveChanges();

            return Ok(new { success = true, message = "Solicitud enviada al Administrador Principal" });
        }

        // =====================================================
        // GET /api/Usuarios/solicitudes-admin
        // [Authorize] — solo Admin Principal
        // =====================================================
        [HttpGet("solicitudes-admin")]
        [Authorize]
        public IActionResult ListarSolicitudes()
        {
            if (!EsAdminPrincipal())
                return Forbid();

            var solicitudes = _context.SolicitudesAdmin
                .Include(s => s.Usuario)
                .OrderByDescending(s => s.FechaSolicitud)
                .Select(s => new
                {
                    s.Id,
                    s.Estado,
                    s.Mensaje,
                    s.FechaSolicitud,
                    s.FechaResolucion,
                    usuario = new
                    {
                        s.Usuario!.Id,
                        s.Usuario.Nombre,
                        s.Usuario.Cedula,
                        s.Usuario.TipoRol,
                        s.Usuario.FotoUrl
                    }
                })
                .ToList();

            return Ok(new { success = true, solicitudes });
        }

        // =====================================================
        // PUT /api/Usuarios/solicitudes-admin/{id}
        // [Authorize] — solo Admin Principal
        // =====================================================
        [HttpPut("solicitudes-admin/{id}")]
        [Authorize]
        public async Task<IActionResult> ResolverSolicitud(int id, [FromBody] ResolucionSolicitudDTO dto)
        {
            if (!EsAdminPrincipal())
                return Forbid();

            var solicitud = _context.SolicitudesAdmin
                .Include(s => s.Usuario)
                .FirstOrDefault(s => s.Id == id);

            if (solicitud == null)
                return NotFound(new { success = false, message = "Solicitud no encontrada" });

            if (solicitud.Estado != "Pendiente")
                return BadRequest(new { success = false, message = "Esta solicitud ya fue resuelta" });

            if (dto.Estado != "Aprobada" && dto.Estado != "Rechazada")
                return BadRequest(new { success = false, message = "Estado inválido" });

            solicitud.Estado          = dto.Estado;
            solicitud.FechaResolucion = DateTime.UtcNow;

            // Si se aprueba, actualizar el rol del usuario
            if (dto.Estado == "Aprobada" && solicitud.Usuario != null)
            {
                solicitud.Usuario.TipoRol   = "Administrador";
                solicitud.Usuario.Jerarquia = "Normal";
            }

            _context.SaveChanges();

            // Notificar al usuario via SignalR
            if (solicitud.Usuario != null)
            {
                var mensajeNotif = dto.Estado == "Aprobada"
                    ? "⭐ Tu solicitud de administrador fue aprobada. Ya tienes privilegios de Administrador."
                    : "❌ Tu solicitud de administrador fue rechazada.";

                await _hubContext.Clients
                    .Group($"usuario_{solicitud.Usuario.Id}")
                    .SendAsync("NotificacionSolicitud", new
                    {
                        tipo    = dto.Estado == "Aprobada" ? "success" : "warning",
                        mensaje = mensajeNotif
                    });
            }

            return Ok(new
            {
                success = true,
                message = dto.Estado == "Aprobada"
                    ? "Solicitud aprobada. El usuario ahora es Administrador."
                    : "Solicitud rechazada."
            });
        }

        // =====================================================
        // DELETE /api/Usuarios/{id}
        // [Authorize] — el propio usuario o Admin
        // =====================================================
        [HttpDelete("{id}")]
        [Authorize]
        public async Task<IActionResult> EliminarCuenta(int id)
        {
            var idToken  = ObtenerIdToken();
            var rolToken = ObtenerRolToken();

            if (idToken != id && rolToken != "Administrador")
                return Forbid();

            var usuario = _context.Usuarios.Find(id);
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            // No se puede eliminar al Admin Principal
            if (usuario.Jerarquia == "Principal")
                return BadRequest(new { success = false, message = "No se puede eliminar al Administrador Principal" });

            // Eliminar foto de perfil de Cloudinary si existe
            if (!string.IsNullOrEmpty(usuario.FotoPublicId))
                await _cloudinary.EliminarAsync(usuario.FotoPublicId);

            _context.Usuarios.Remove(usuario);
            _context.SaveChanges();

            return Ok(new { success = true, message = "Cuenta eliminada correctamente" });
        }
    }
}
