namespace BiblioSync.Models
{
    public class SolicitudAdmin
    {
        public int    Id               { get; set; }
        public int    UsuarioId        { get; set; }

        // Motivo de la solicitud
        public string Mensaje          { get; set; } = string.Empty;

        // 'Pendiente', 'Aprobada', 'Rechazada'
        public string Estado           { get; set; } = "Pendiente";

        public DateTime FechaSolicitud  { get; set; } = DateTime.UtcNow;
        public DateTime? FechaResolucion { get; set; }

        // Navegación
        public Usuario? Usuario        { get; set; }
    }
}
