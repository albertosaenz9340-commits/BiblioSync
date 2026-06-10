using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    // Envío de mensaje
    public class MensajeDTO
    {
        [Required(ErrorMessage = "El receptor es obligatorio")]
        public int ReceptorId { get; set; }

        [Required(ErrorMessage = "El contenido es obligatorio")]
        [MaxLength(2000, ErrorMessage = "El mensaje no puede superar los 2000 caracteres")]
        public string Contenido { get; set; } = string.Empty;
    }

    // Marcar mensajes como leídos
    public class MarcarLeidoDTO
    {
        [Required]
        public int RemitenteId { get; set; }
    }
}
