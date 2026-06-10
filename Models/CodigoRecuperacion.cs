namespace BiblioSync.Models
{
    public class CodigoRecuperacion
    {
        public int    Id         { get; set; }
        public int    UsuarioId  { get; set; }

        // Formato XXXX-XXXX sin 0/O ni 1/I
        public string Codigo     { get; set; } = string.Empty;

        // UTC — expira 15 minutos después de generado
        public DateTime Expiracion { get; set; }

        // true = ya utilizado, no reutilizable
        public bool   Usado      { get; set; } = false;

        // Navegación
        public Usuario? Usuario  { get; set; }
    }
}
