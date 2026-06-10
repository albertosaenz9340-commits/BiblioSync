using BiblioSync.Data;
using BiblioSync.DTOs;
using BiblioSync.Models;
using BiblioSync.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BiblioSync.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class LibrosController : ControllerBase
    {
        private readonly AppDbContext      _context;
        private readonly CloudinaryService _cloudinary;
        private readonly IConfiguration   _config;

        public LibrosController(
            AppDbContext context,
            CloudinaryService cloudinary,
            IConfiguration config)
        {
            _context    = context;
            _cloudinary = cloudinary;
            _config     = config;
        }

        private string ObtenerRolToken() =>
            User.FindFirst("rol")?.Value ?? "";

        private string ObtenerJerarquiaToken() =>
            User.FindFirst("jerarquia")?.Value ?? "Normal";

        private bool EsAdmin() =>
            ObtenerRolToken() == "Administrador";

        private int ObtenerIdToken() =>
            int.Parse(User.FindFirst("id")!.Value);

        // =====================================================
        // GET /api/Libros
        // Catálogo completo — PDFs NO expuestos aquí
        // =====================================================
        [HttpGet]
        public IActionResult ObtenerLibros([FromQuery] string? buscar = null)
        {
            var query = _context.Libros.AsQueryable();

            if (!string.IsNullOrWhiteSpace(buscar))
                query = query.Where(l =>
                    l.Titulo.Contains(buscar)    ||
                    l.Autor.Contains(buscar)     ||
                    l.Categoria.Contains(buscar) ||
                    l.Isbn.Contains(buscar));

            var libros = query
                .OrderBy(l => l.Titulo)
                .Select(l => new
                {
                    l.Id,
                    l.Titulo,
                    l.Autor,
                    l.Isbn,
                    l.Editorial,
                    l.Anio,
                    l.Categoria,
                    l.Cantidad,
                    l.Sinopsis,
                    l.Imagen,
                    disponible = l.Cantidad > 0,
                    tienePdf   = !string.IsNullOrEmpty(l.PdfUrl)
                    // PdfUrl NO se expone en el catálogo general
                    // Solo se entrega por /api/Prestamos/pdf/{prestamoId}
                })
                .ToList();

            return Ok(new { success = true, libros });
        }

        // =====================================================
        // GET /api/Libros/{id}
        // Detalle de un libro — sin PDF
        // =====================================================
        [HttpGet("{id}")]
        public IActionResult ObtenerLibro(int id)
        {
            var libro = _context.Libros
                .Where(l => l.Id == id)
                .Select(l => new
                {
                    l.Id,
                    l.Titulo,
                    l.Autor,
                    l.Isbn,
                    l.Editorial,
                    l.Anio,
                    l.Categoria,
                    l.Cantidad,
                    l.Sinopsis,
                    l.Imagen,
                    disponible = l.Cantidad > 0,
                    tienePdf   = !string.IsNullOrEmpty(l.PdfUrl)
                })
                .FirstOrDefault();

            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            return Ok(new { success = true, libro });
        }

        // =====================================================
        // GET /api/Libros/categoria/{categoria}
        // Filtrar por área del conocimiento
        // =====================================================
        [HttpGet("categoria/{categoria}")]
        public IActionResult FiltrarPorCategoria(string categoria)
        {
            var libros = _context.Libros
                .Where(l => l.Categoria.ToLower() == categoria.ToLower())
                .OrderBy(l => l.Titulo)
                .Select(l => new
                {
                    l.Id,
                    l.Titulo,
                    l.Autor,
                    l.Isbn,
                    l.Editorial,
                    l.Anio,
                    l.Categoria,
                    l.Cantidad,
                    l.Sinopsis,
                    l.Imagen,
                    disponible = l.Cantidad > 0,
                    tienePdf   = !string.IsNullOrEmpty(l.PdfUrl)
                })
                .ToList();

            return Ok(new { success = true, libros });
        }

        // =====================================================
        // GET /api/Libros/categorias/lista
        // Lista de categorías únicas para selectores
        // =====================================================
        [HttpGet("categorias/lista")]
        public IActionResult ObtenerCategorias()
        {
            var categorias = _context.Libros
                .Select(l => l.Categoria)
                .Distinct()
                .OrderBy(c => c)
                .ToList();

            return Ok(new { success = true, categorias });
        }

        // =====================================================
        // POST /api/Libros
        // [Admin] — registrar nuevo libro (sin archivos)
        // =====================================================
        [HttpPost]
        public IActionResult AgregarLibro([FromBody] LibroDTO dto)
        {
            if (!EsAdmin())
                return Forbid();

            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos", errores = ModelState });

            if (_context.Libros.Any(l => l.Isbn == dto.Isbn.Trim()))
                return BadRequest(new { success = false, message = "Ya existe un libro con ese ISBN" });

            var libro = new Libro
            {
                Titulo    = dto.Titulo.Trim(),
                Autor     = dto.Autor.Trim(),
                Isbn      = dto.Isbn.Trim(),
                Editorial = dto.Editorial?.Trim() ?? string.Empty,
                Anio      = dto.Anio,
                Categoria = dto.Categoria.Trim(),
                Cantidad  = dto.Cantidad,
                Sinopsis  = dto.Sinopsis?.Trim() ?? string.Empty
            };

            _context.Libros.Add(libro);
            _context.SaveChanges();

            return Ok(new { success = true, message = "Libro registrado exitosamente", id = libro.Id });
        }

        // =====================================================
        // PUT /api/Libros/{id}
        // [Admin] — editar datos bibliográficos
        // =====================================================
        [HttpPut("{id}")]
        public IActionResult EditarLibro(int id, [FromBody] LibroDTO dto)
        {
            if (!EsAdmin())
                return Forbid();

            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "Datos inválidos", errores = ModelState });

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            if (_context.Libros.Any(l => l.Isbn == dto.Isbn.Trim() && l.Id != id))
                return BadRequest(new { success = false, message = "Ese ISBN ya está en uso por otro libro" });

            libro.Titulo    = dto.Titulo.Trim();
            libro.Autor     = dto.Autor.Trim();
            libro.Isbn      = dto.Isbn.Trim();
            libro.Editorial = dto.Editorial?.Trim() ?? string.Empty;
            libro.Anio      = dto.Anio;
            libro.Categoria = dto.Categoria.Trim();
            libro.Cantidad  = dto.Cantidad;
            libro.Sinopsis  = dto.Sinopsis?.Trim() ?? string.Empty;

            _context.SaveChanges();

            return Ok(new { success = true, message = "Libro actualizado correctamente" });
        }

        // =====================================================
        // POST /api/Libros/{id}/portada
        // [Admin] — subir o reemplazar portada en Cloudinary
        // =====================================================
        [HttpPost("{id}/portada")]
        public async Task<IActionResult> SubirPortada(int id, IFormFile imagen)
        {
            if (!EsAdmin())
                return Forbid();

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            try
            {
                // Eliminar portada anterior si existe
                if (!string.IsNullOrEmpty(libro.ImagenPublicId))
                    await _cloudinary.EliminarAsync(libro.ImagenPublicId);

                var (url, publicId) = await _cloudinary.SubirImagenAsync(imagen, "portadas");

                libro.Imagen         = url;
                libro.ImagenPublicId = publicId;
                _context.SaveChanges();

                return Ok(new { success = true, imagenUrl = url, message = "Portada actualizada" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
        }

        // =====================================================
        // DELETE /api/Libros/{id}/portada
        // [Admin] — eliminar portada
        // =====================================================
        [HttpDelete("{id}/portada")]
        public async Task<IActionResult> EliminarPortada(int id)
        {
            if (!EsAdmin())
                return Forbid();

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            if (!string.IsNullOrEmpty(libro.ImagenPublicId))
                await _cloudinary.EliminarAsync(libro.ImagenPublicId);

            libro.Imagen         = string.Empty;
            libro.ImagenPublicId = string.Empty;
            _context.SaveChanges();

            return Ok(new { success = true, message = "Portada eliminada" });
        }

        // =====================================================
        // POST /api/Libros/{id}/pdf
        // [Admin] — subir o reemplazar PDF en Cloudinary
        // =====================================================
        // =====================================================
        // GET /api/Libros/{id}/pdf-signature
        // [Admin] — genera firma para upload directo a Cloudinary
        // El PDF va directo del navegador a Cloudinary sin pasar
        // por el servidor — evita timeouts con archivos grandes
        // =====================================================
        [HttpGet("{id}/pdf-signature")]
        public IActionResult ObtenerFirmaPdf(int id)
        {
            if (!EsAdmin())
                return Forbid();

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            var cloudName  = _config["Cloudinary:CloudName"]!;
            var apiKey     = _config["Cloudinary:ApiKey"]!;
            var apiSecret  = _config["Cloudinary:ApiSecret"]!;

            var timestamp    = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            var folder       = "bibliosync/pdfs";
            var resourceType = "raw";

            // La firma NO incluye folder ni resource_type cuando se usan como params separados
            // Solo se firman los parámetros que se envían en el upload
            // Parámetros deben estar ordenados alfabéticamente
            var paramsToSign = $"folder={folder}&timestamp={timestamp}";
            var toHash       = paramsToSign + apiSecret;

            string firma;
            using (var sha1 = System.Security.Cryptography.SHA1.Create())
            {
                var hash = sha1.ComputeHash(System.Text.Encoding.UTF8.GetBytes(toHash));
                firma = BitConverter.ToString(hash).Replace("-", "").ToLower();
            }

            return Ok(new
            {
                success      = true,
                cloudName,
                apiKey,
                timestamp,
                folder,
                resourceType,
                firma,
                publicIdAnterior = libro.PdfPublicId
            });
        }

        // =====================================================
        // POST /api/Libros/{id}/pdf-confirmar
        // [Admin] — guarda la URL y publicId tras el upload directo
        // =====================================================
        [HttpPost("{id}/pdf-confirmar")]
        public async Task<IActionResult> ConfirmarPdf(int id, [FromBody] ConfirmarPdfDTO dto)
        {
            if (!EsAdmin())
                return Forbid();

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            // Eliminar PDF anterior de Cloudinary si existe
            if (!string.IsNullOrEmpty(libro.PdfPublicId) && libro.PdfPublicId != dto.PublicId)
                await _cloudinary.EliminarAsync(libro.PdfPublicId, esPdf: true);

            libro.PdfUrl      = dto.SecureUrl;
            libro.PdfPublicId = dto.PublicId;
            _context.SaveChanges();

            return Ok(new { success = true, message = "PDF guardado correctamente" });
        }

        // =====================================================
        // POST /api/Libros/{id}/pdf
        // [Admin] — mantener para compatibilidad (archivos pequeños)
        // =====================================================
        [HttpPost("{id}/pdf")]
        [DisableRequestSizeLimit]
        public async Task<IActionResult> SubirPdf(int id, IFormFile pdf)
        {
            if (!EsAdmin())
                return Forbid();

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            try
            {
                if (!string.IsNullOrEmpty(libro.PdfPublicId))
                    await _cloudinary.EliminarAsync(libro.PdfPublicId, esPdf: true);

                var (url, publicId) = await _cloudinary.SubirPdfAsync(pdf, "pdfs");

                libro.PdfUrl      = url;
                libro.PdfPublicId = publicId;
                _context.SaveChanges();

                return Ok(new { success = true, message = "PDF subido correctamente" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { success = false, message = ex.Message });
            }
        }

        // =====================================================
        // DELETE /api/Libros/{id}/pdf
        // [Admin] — eliminar PDF del libro
        // =====================================================
        [HttpDelete("{id}/pdf")]
        public async Task<IActionResult> EliminarPdf(int id)
        {
            if (!EsAdmin())
                return Forbid();

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            if (!string.IsNullOrEmpty(libro.PdfPublicId))
                await _cloudinary.EliminarAsync(libro.PdfPublicId, esPdf: true);

            libro.PdfUrl      = string.Empty;
            libro.PdfPublicId = string.Empty;
            _context.SaveChanges();

            return Ok(new { success = true, message = "PDF eliminado" });
        }

        // =====================================================
        // DELETE /api/Libros/{id}
        // [Admin] — eliminar libro (sin préstamos activos)
        // =====================================================
        [HttpDelete("{id}")]
        public async Task<IActionResult> EliminarLibro(int id)
        {
            if (!EsAdmin())
                return Forbid();

            var libro = _context.Libros.Find(id);
            if (libro == null)
                return NotFound(new { success = false, message = "Libro no encontrado" });

            if (_context.Prestamos.Any(p => p.LibroId == id && p.Estado == "Activo"))
                return BadRequest(new { success = false, message = "No se puede eliminar: el libro tiene préstamos activos" });

            // Eliminar portada y PDF de Cloudinary
            if (!string.IsNullOrEmpty(libro.ImagenPublicId))
                await _cloudinary.EliminarAsync(libro.ImagenPublicId);

            if (!string.IsNullOrEmpty(libro.PdfPublicId))
                await _cloudinary.EliminarAsync(libro.PdfPublicId, esPdf: true);

            _context.Libros.Remove(libro);
            _context.SaveChanges();

            return Ok(new { success = true, message = "Libro eliminado correctamente" });
        }
    }
}
