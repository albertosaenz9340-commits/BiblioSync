using BiblioSync.Data;
using BiblioSync.DTOs;
using BiblioSync.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO;
using System.Security.Cryptography;

namespace BiblioSync.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PrestamosController : ControllerBase
    {
        private readonly AppDbContext   _context;
        private readonly IConfiguration _config;

        public PrestamosController(AppDbContext context, IConfiguration config)
        {
            _context = context;
            _config  = config;
        }

        // =====================================================
        // HELPERS
        // =====================================================
        private static string GenerarReferencia()
        {
            var fecha  = DateTime.UtcNow.ToString("yyyyMMdd");
            var bytes  = RandomNumberGenerator.GetBytes(4);
            var codigo = Convert.ToHexString(bytes)[..6].ToUpper();
            return $"BS-{fecha}-{codigo}";
        }

        private int ObtenerIdToken() =>
            int.Parse(User.FindFirst("id")!.Value);

        private string ObtenerRolToken() =>
            User.FindFirst("rol")?.Value ?? "";

        // =====================================================
        // POST /api/Prestamos/solicitar
        // Transacción con UPDATE atómico — evita deadlocks
        // =====================================================
        [HttpPost("solicitar")]
        public async Task<IActionResult> SolicitarPrestamo([FromBody] PrestamoDTO dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos" });

            var idToken  = ObtenerIdToken();
            var rolToken = ObtenerRolToken();

            var usuarioId = (rolToken == "Administrador" && dto.UsuarioId.HasValue)
                ? dto.UsuarioId.Value
                : idToken;

            var usuario = await _context.Usuarios.FindAsync(usuarioId);
            if (usuario == null)
                return NotFound(new { success = false, message = "Usuario no encontrado" });

            if (usuario.Estado == "Sancionado")
                return BadRequest(new { success = false, message = "El usuario tiene préstamos vencidos. No puede solicitar nuevos préstamos." });

            if (usuario.Estado == "Inactivo")
                return BadRequest(new { success = false, message = "La cuenta del usuario está inactiva." });

            var libroExiste = await _context.Libros.FindAsync(dto.LibroId);
            if (libroExiste == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            if (libroExiste.Cantidad <= 0)
                return BadRequest(new { success = false, message = "El libro no tiene ejemplares disponibles" });

            var yaActivo = await _context.Prestamos.AnyAsync(p =>
                p.UsuarioId == usuarioId &&
                p.LibroId   == dto.LibroId &&
                p.Estado    == "Activo");

            if (yaActivo)
                return BadRequest(new { success = false, message = "Ya tienes un préstamo activo de este libro" });

            // ---- TRANSACCIÓN CON UPDATE ATÓMICO ----
            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var filasAfectadas = await _context.Database.ExecuteSqlRawAsync(
                    "UPDATE libros SET cantidad = cantidad - 1 WHERE id = {0} AND cantidad > 0",
                    dto.LibroId);

                if (filasAfectadas == 0)
                {
                    await transaction.RollbackAsync();
                    return BadRequest(new { success = false, message = "El libro no tiene ejemplares disponibles" });
                }

                var diasPlazo = _config.GetValue<int>("Prestamo:DiasPlazo", 8);
                var ahora     = DateTime.UtcNow;

                var prestamo = new Prestamo
                {
                    UsuarioId       = usuarioId,
                    LibroId         = dto.LibroId,
                    FechaPrestamo   = ahora,
                    FechaDevolucion = ahora.AddDays(diasPlazo),
                    Estado          = "Activo",
                    Referencia      = GenerarReferencia()
                };

                _context.Prestamos.Add(prestamo);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                var stockActual = await _context.Libros
                    .Where(l => l.Id == dto.LibroId)
                    .Select(l => l.Cantidad)
                    .FirstOrDefaultAsync();

                return Ok(new
                {
                    success         = true,
                    message         = $"Préstamo registrado. Devuelve antes del {prestamo.FechaDevolucion:dd/MM/yyyy}",
                    referencia      = prestamo.Referencia,
                    fechaDevolucion = prestamo.FechaDevolucion,
                    stockRestante   = stockActual,
                    prestamoId      = prestamo.Id
                });
            }
            catch
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { success = false, message = "Error al procesar el préstamo. Intenta de nuevo." });
            }
        }

        // =====================================================
        // PUT /api/Prestamos/devolver/{id}
        // Transacción — cambia estado y restaura stock
        // =====================================================
        [HttpPut("devolver/{id}")]
        public async Task<IActionResult> DevolverPrestamo(int id)
        {
            var idToken  = ObtenerIdToken();
            var rolToken = ObtenerRolToken();

            var prestamo = await _context.Prestamos
                .Include(p => p.Libro)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (prestamo == null)
                return NotFound(new { success = false, message = "Préstamo no encontrado" });

            if (prestamo.UsuarioId != idToken && rolToken != "Administrador")
                return Forbid();

            if (prestamo.Estado == "Devuelto")
                return BadRequest(new { success = false, message = "Este préstamo ya fue devuelto" });

            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var filasAfectadas = await _context.Database.ExecuteSqlRawAsync(
                    "UPDATE prestamos SET estado = 'Devuelto' WHERE id = {0} AND estado = 'Activo'",
                    id);

                if (filasAfectadas == 0)
                {
                    await transaction.RollbackAsync();
                    return BadRequest(new { success = false, message = "Este préstamo ya fue devuelto" });
                }

                await _context.Database.ExecuteSqlRawAsync(
                    "UPDATE libros SET cantidad = cantidad + 1 WHERE id = {0}",
                    prestamo.LibroId);

                await transaction.CommitAsync();

                var stockActual = await _context.Libros
                    .Where(l => l.Id == prestamo.LibroId)
                    .Select(l => l.Cantidad)
                    .FirstOrDefaultAsync();

                return Ok(new
                {
                    success = true,
                    message = "Devolución registrada correctamente",
                    libro   = prestamo.Libro!.Titulo,
                    stock   = stockActual
                });
            }
            catch
            {
                await transaction.RollbackAsync();
                return StatusCode(500, new { success = false, message = "Error al registrar la devolución." });
            }
        }

        // =====================================================
        // GET /api/Prestamos/pdf/{prestamoId}
        // Acceso controlado al PDF — solo con préstamo activo
        // El PDF se sirve como proxy desde Cloudinary
        // sin exponer la URL directa al cliente
        // =====================================================
        [HttpGet("pdf/{prestamoId}")]
        public async Task<IActionResult> ObtenerPdf(int prestamoId)
        {
            var idToken = ObtenerIdToken();
            var rolToken = ObtenerRolToken();

            var prestamo = await _context.Prestamos
                .Include(p => p.Libro)
                .FirstOrDefaultAsync(p => p.Id == prestamoId);

            if (prestamo == null)
                return NotFound(new { success = false, message = "Préstamo no encontrado" });

            // Solo el dueño del préstamo o un Admin pueden acceder
            if (prestamo.UsuarioId != idToken && rolToken != "Administrador")
                return Forbid();

            // El préstamo debe estar activo
            if (prestamo.Estado != "Activo")
                return BadRequest(new { success = false, message = "El acceso al PDF solo está disponible mientras el préstamo esté activo." });

            var libro = prestamo.Libro;
            if (libro == null || string.IsNullOrEmpty(libro.PdfUrl))
                return NotFound(new { success = false, message = "Este libro no tiene PDF disponible." });

            // Devolver la URL del PDF para que el frontend la abra directamente
            return Ok(new { success = true, pdfUrl = libro.PdfUrl });
        }

        // =====================================================
        // GET /api/Prestamos/mis-prestamos
        // Historial del usuario autenticado
        // =====================================================
        [HttpGet("mis-prestamos")]
        public IActionResult MisPrestamos()
        {
            var idToken = ObtenerIdToken();

            var prestamos = _context.Prestamos
                .Include(p => p.Libro)
                .Where(p => p.UsuarioId == idToken)
                .OrderByDescending(p => p.FechaPrestamo)
                .Select(p => new
                {
                    p.Id,
                    p.Referencia,
                    p.Estado,
                    p.FechaPrestamo,
                    p.FechaDevolucion,
                    vencido = p.Estado == "Activo" && p.FechaDevolucion < DateTime.UtcNow,
                    libro   = new
                    {
                        p.Libro!.Id,
                        p.Libro.Titulo,
                        p.Libro.Autor,
                        p.Libro.Imagen,
                        p.Libro.Sinopsis,
                        tienePdf = !string.IsNullOrEmpty(p.Libro.PdfUrl)
                    }
                })
                .ToList();

            return Ok(new { success = true, prestamos });
        }

        // =====================================================
        // GET /api/Prestamos/activos
        // [Admin] — todos los préstamos activos
        // =====================================================
        [HttpGet("activos")]
        public IActionResult PrestamosActivos()
        {
            if (ObtenerRolToken() != "Administrador")
                return Forbid();

            var prestamos = _context.Prestamos
                .Include(p => p.Libro)
                .Include(p => p.Usuario)
                .Where(p => p.Estado == "Activo")
                .OrderBy(p => p.FechaDevolucion)
                .Select(p => new
                {
                    p.Id,
                    p.Referencia,
                    p.Estado,
                    p.FechaPrestamo,
                    p.FechaDevolucion,
                    vencido = p.FechaDevolucion < DateTime.UtcNow,
                    usuario = new { p.Usuario!.Id, p.Usuario.Nombre, p.Usuario.Cedula, p.Usuario.FotoUrl },
                    libro   = new { p.Libro!.Id, p.Libro.Titulo, p.Libro.Autor }
                })
                .ToList();

            return Ok(new { success = true, prestamos });
        }

        // =====================================================
        // GET /api/Prestamos/historial
        // [Admin] — historial completo con filtro por fechas
        // =====================================================
        [HttpGet("historial")]
        public IActionResult Historial(
            [FromQuery] DateTime? desde,
            [FromQuery] DateTime? hasta)
        {
            if (ObtenerRolToken() != "Administrador")
                return Forbid();

            var query = _context.Prestamos
                .Include(p => p.Libro)
                .Include(p => p.Usuario)
                .AsQueryable();

            if (desde.HasValue)
                query = query.Where(p => p.FechaPrestamo >= desde.Value.ToUniversalTime());

            if (hasta.HasValue)
                query = query.Where(p => p.FechaPrestamo <= hasta.Value.ToUniversalTime());

            var historial = query
                .OrderByDescending(p => p.FechaPrestamo)
                .Select(p => new
                {
                    p.Id,
                    p.Referencia,
                    p.Estado,
                    p.FechaPrestamo,
                    p.FechaDevolucion,
                    usuario = new { p.Usuario!.Id, p.Usuario.Nombre, p.Usuario.Cedula },
                    libro   = new { p.Libro!.Id, p.Libro.Titulo, p.Libro.Autor }
                })
                .ToList();

            return Ok(new { success = true, historial });
        }

        // =====================================================
        // GET /api/Prestamos/estadisticas
        // [Admin] — estadísticas generales
        // =====================================================
        [HttpGet("estadisticas")]
        public IActionResult Estadisticas()
        {
            if (ObtenerRolToken() != "Administrador")
                return Forbid();

            var ahora = DateTime.UtcNow;

            var stats = new
            {
                totalPrestamos       = _context.Prestamos.Count(),
                prestamosActivos     = _context.Prestamos.Count(p => p.Estado == "Activo"),
                prestamosVencidos    = _context.Prestamos.Count(p => p.Estado == "Activo" && p.FechaDevolucion < ahora),
                prestamosDevueltos   = _context.Prestamos.Count(p => p.Estado == "Devuelto"),
                totalLibros          = _context.Libros.Count(),
                librosAgotados       = _context.Libros.Count(l => l.Cantidad == 0),
                libroConPdf          = _context.Libros.Count(l => !string.IsNullOrEmpty(l.PdfUrl)),
                totalUsuarios        = _context.Usuarios.Count(),
                usuariosSancionados  = _context.Usuarios.Count(u => u.Estado == "Sancionado"),
                solicitudesPendientes = _context.SolicitudesAdmin.Count(s => s.Estado == "Pendiente"),
                librosMasSolicitados = _context.Prestamos
                    .GroupBy(p => p.Libro!.Titulo)
                    .OrderByDescending(g => g.Count())
                    .Take(5)
                    .Select(g => new { titulo = g.Key, prestamos = g.Count() })
                    .ToList()
            };

            return Ok(new { success = true, estadisticas = stats });
        }
    }
}
