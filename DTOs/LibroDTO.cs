using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    public class LibroDTO
    {
        [Required(ErrorMessage = "El título es obligatorio")]
        [MaxLength(150)]
        public string Titulo { get; set; } = string.Empty;

        [Required(ErrorMessage = "El autor es obligatorio")]
        [MaxLength(100)]
        public string Autor { get; set; } = string.Empty;

        [Required(ErrorMessage = "El ISBN es obligatorio")]
        [MaxLength(30)]
        public string Isbn { get; set; } = string.Empty;

        [MaxLength(100)]
        public string Editorial { get; set; } = string.Empty;

        [Range(1400, 2100, ErrorMessage = "Año inválido")]
        public int Anio { get; set; }

        [Required(ErrorMessage = "La categoría es obligatoria")]
        [MaxLength(50)]
        public string Categoria { get; set; } = string.Empty;

        [Range(0, 9999, ErrorMessage = "La cantidad debe ser mayor o igual a cero")]
        public int Cantidad { get; set; } = 1;

        public string Sinopsis { get; set; } = string.Empty;

        // Las URLs de imagen y PDF se generan desde Cloudinary
        // No se reciben del cliente en el DTO de texto
        // Se manejan por endpoints separados de upload
    }
}
