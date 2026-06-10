namespace BiblioSync.Models
{
    public class Mensaje
    {
        public int    Id           { get; set; }
        public int    RemitenteId  { get; set; }
        public int    ReceptorId   { get; set; }
        public string Contenido    { get; set; } = string.Empty;
        public bool   Leido        { get; set; } = false;
        public DateTime FechaEnvio { get; set; } = DateTime.UtcNow;

        // Navegación
        public Usuario? Remitente  { get; set; }
        public Usuario? Receptor   { get; set; }
    }
}
