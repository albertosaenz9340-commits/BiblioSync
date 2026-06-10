using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    // Cambio de contraseña estando logueado — exige contraseña actual
    public class CambioPasswordDTO
    {
        [Required(ErrorMessage = "La contraseña actual es obligatoria")]
        public string PasswordActual { get; set; } = string.Empty;

        [Required(ErrorMessage = "La nueva contraseña es obligatoria")]
        [MinLength(6, ErrorMessage = "La contraseña debe tener al menos 6 caracteres")]
        public string NuevaPassword { get; set; } = string.Empty;
    }
}
