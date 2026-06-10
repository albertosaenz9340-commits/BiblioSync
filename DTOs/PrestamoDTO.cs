using System.ComponentModel.DataAnnotations;

namespace BiblioSync.DTOs
{
    public class PrestamoDTO
    {
        // El usuario_id se extrae del token JWT en el controlador
        // Este campo solo aplica para operaciones administrativas
        public int? UsuarioId { get; set; }

        [Required(ErrorMessage = "El ID del libro es obligatorio")]
        public int LibroId { get; set; }
    }
}
