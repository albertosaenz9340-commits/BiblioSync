using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    // Paso 1 — solicitar código de recuperación
    public class SolicitudRecuperacionDTO
    {
        [Required(ErrorMessage = "La cédula es obligatoria")]
        public string Cedula { get; set; } = string.Empty;
    }

    // Paso 2 — usar código para cambiar contraseña
    public class RecuperarPasswordDTO
    {
        [Required(ErrorMessage = "La cédula es obligatoria")]
        public string Cedula { get; set; } = string.Empty;

        [Required(ErrorMessage = "El código es obligatorio")]
        public string Codigo { get; set; } = string.Empty;

        [Required(ErrorMessage = "La nueva contraseña es obligatoria")]
        [MinLength(6, ErrorMessage = "La contraseña debe tener al menos 6 caracteres")]
        public string NuevaPassword { get; set; } = string.Empty;
    }
}
