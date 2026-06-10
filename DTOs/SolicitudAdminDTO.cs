using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    // Solicitud de privilegios administrativos
    public class SolicitudAdminDTO
    {
        [MaxLength(500)]
        public string Mensaje { get; set; } = string.Empty;
    }

    // Resolución de solicitud por Admin Principal
    public class ResolucionSolicitudDTO
    {
        [Required]
        public string Estado { get; set; } = string.Empty; // 'Aprobada' | 'Rechazada'
    }
}
