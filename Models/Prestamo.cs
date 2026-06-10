namespace BiblioSync.Models
{
    public class Prestamo
    {
        public int    Id              { get; set; }
        public int    UsuarioId       { get; set; }
        public int    LibroId         { get; set; }

        // Siempre UTC — frontend convierte a hora local
        public DateTime FechaPrestamo   { get; set; } = DateTime.UtcNow;
        public DateTime FechaDevolucion { get; set; }

        // 'Activo', 'Devuelto', 'Vencido'
        public string Estado          { get; set; } = "Activo";

        // Formato: BS-AAAAMMDD-XXXXXX
        public string Referencia      { get; set; } = string.Empty;

        // Navegación
        public Usuario? Usuario { get; set; }
        public Libro?   Libro   { get; set; }
    }
}
