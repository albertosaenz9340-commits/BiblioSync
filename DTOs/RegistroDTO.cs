using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    public class RegistroDTO
    {
        [Required(ErrorMessage = "El nombre es obligatorio")]
        [MaxLength(100)]
        public string Nombre { get; set; } = string.Empty;

        [Required(ErrorMessage = "La cédula es obligatoria")]
        [MaxLength(20)]
        public string Cedula { get; set; } = string.Empty;

        [Required(ErrorMessage = "El correo es obligatorio")]
        [EmailAddress(ErrorMessage = "Formato de correo inválido")]
        [MaxLength(100)]
        public string Correo { get; set; } = string.Empty;

        [Required(ErrorMessage = "La contraseña es obligatoria")]
        [MinLength(6, ErrorMessage = "La contraseña debe tener al menos 6 caracteres")]
        public string Password { get; set; } = string.Empty;

        // 'Estudiante' o 'Docente' — Administrador solo para primer registro o admin autenticado
        public string TipoRol { get; set; } = "Estudiante";

        // true solo cuando es el primer usuario registrándose como Admin Principal
        public bool EsPrincipal { get; set; } = false;
    }
}
