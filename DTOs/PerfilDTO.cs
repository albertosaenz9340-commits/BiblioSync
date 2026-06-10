using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    // Actualización de descripción personal
    public class PerfilDTO
    {
        [MaxLength(500)]
        public string Descripcion { get; set; } = string.Empty;
    }

    // Cambio de estado de usuario por Admin
    public class CambioEstadoDTO
    {
        [Required]
        public string Estado { get; set; } = string.Empty;
    }

    // Designación o revocación de rol Admin por Admin Principal
    public class CambioRolDTO
    {
        [Required]
        public string TipoRol { get; set; } = string.Empty;
    }
}
