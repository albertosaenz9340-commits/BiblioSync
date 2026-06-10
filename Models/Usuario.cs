namespace BiblioSync.Models
{
    public class Usuario
    {
        public int    Id            { get; set; }
        public string Nombre        { get; set; } = string.Empty;
        public string UsuarioLogin  { get; set; } = string.Empty;

        // Hash BCrypt — nunca texto plano
        public string Password      { get; set; } = string.Empty;
        public string Cedula        { get; set; } = string.Empty;
        public string Correo        { get; set; } = string.Empty;

        // 'Estudiante', 'Docente', 'Administrador'
        public string TipoRol       { get; set; } = "Estudiante";

        // 'Principal' (primer admin) | 'Normal'
        public string Jerarquia     { get; set; } = "Normal";

        // Rol anterior antes de ser designado Admin (para poder revocar correctamente)
        public string RolAnterior   { get; set; } = "Estudiante";

        // 'Activo', 'Sancionado', 'Inactivo'
        public string Estado        { get; set; } = "Activo";

        // Perfil personal
        public string Descripcion   { get; set; } = string.Empty;
        public string FotoUrl       { get; set; } = string.Empty;
        public string FotoPublicId  { get; set; } = string.Empty;

        public DateTime FechaRegistro { get; set; } = DateTime.UtcNow;

        // Navegación
        public List<Prestamo>        Prestamos         { get; set; } = new();
        public List<Mensaje>         MensajesEnviados  { get; set; } = new();
        public List<Mensaje>         MensajesRecibidos { get; set; } = new();
        public List<SolicitudAdmin>  Solicitudes       { get; set; } = new();
    }
}
