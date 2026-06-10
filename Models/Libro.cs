namespace BiblioSync.Models
{
    public class Libro
    {
        public int    Id             { get; set; }
        public string Titulo         { get; set; } = string.Empty;
        public string Autor          { get; set; } = string.Empty;
        public string Isbn           { get; set; } = string.Empty;
        public string Editorial      { get; set; } = string.Empty;
        public int    Anio           { get; set; }
        public string Categoria      { get; set; } = string.Empty;

        // Stock físico — nunca negativo (CHECK en BD)
        public int    Cantidad       { get; set; } = 1;

        // Descripción del libro
        public string Sinopsis       { get; set; } = string.Empty;

        // Portada — URL y public_id de Cloudinary
        public string Imagen         { get; set; } = string.Empty;
        public string ImagenPublicId { get; set; } = string.Empty;

        // PDF — acceso controlado por préstamo activo
        public string PdfUrl         { get; set; } = string.Empty;
        public string PdfPublicId    { get; set; } = string.Empty;

        // Navegación
        public List<Prestamo> Prestamos { get; set; } = new();
    }
}
