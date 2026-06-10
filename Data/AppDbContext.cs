using Microsoft.EntityFrameworkCore;
using BiblioSync.Models;

namespace BiblioSync.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options) { }

        public DbSet<Usuario>            Usuarios            { get; set; }
        public DbSet<Libro>              Libros              { get; set; }
        public DbSet<Prestamo>           Prestamos           { get; set; }
        public DbSet<CodigoRecuperacion> CodigosRecuperacion { get; set; }
        public DbSet<Mensaje>            Mensajes            { get; set; }
        public DbSet<SolicitudAdmin>     SolicitudesAdmin    { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // =====================================================
            // TABLA: usuarios
            // =====================================================
            modelBuilder.Entity<Usuario>(entity =>
            {
                entity.ToTable("usuarios");
                entity.HasKey(x => x.Id);

                entity.Property(x => x.Id).HasColumnName("id");
                entity.Property(x => x.Nombre)
                    .IsRequired().HasColumnName("nombre").HasMaxLength(100);
                entity.Property(x => x.UsuarioLogin)
                    .IsRequired().HasColumnName("usuario_login").HasMaxLength(50);
                entity.Property(x => x.Password)
                    .IsRequired().HasColumnName("password").HasMaxLength(255);
                entity.Property(x => x.Cedula)
                    .IsRequired().HasColumnName("cedula").HasMaxLength(20);
                entity.Property(x => x.Correo)
                    .IsRequired().HasColumnName("correo").HasMaxLength(100);
                entity.Property(x => x.TipoRol)
                    .IsRequired().HasColumnName("tipo_rol").HasMaxLength(20)
                    .HasDefaultValue("Estudiante");
                entity.Property(x => x.Jerarquia)
                    .IsRequired().HasColumnName("jerarquia").HasMaxLength(20)
                    .HasDefaultValue("Normal");
                entity.Property(x => x.Estado)
                    .IsRequired().HasColumnName("estado").HasMaxLength(20)
                    .HasDefaultValue("Activo");
                entity.Property(x => x.Descripcion)
                    .HasColumnName("descripcion").HasMaxLength(500)
                    .HasDefaultValue("");
                entity.Property(x => x.FotoUrl)
                    .HasColumnName("foto_url").HasMaxLength(500)
                    .HasDefaultValue("");
                entity.Property(x => x.FotoPublicId)
                    .HasColumnName("foto_public_id").HasMaxLength(255)
                    .HasDefaultValue("");
                entity.Property(x => x.RolAnterior)
                    .HasColumnName("rol_anterior").HasMaxLength(20)
                    .HasDefaultValue("Estudiante");
                entity.Property(x => x.FechaRegistro)
                    .HasColumnName("fecha_registro");

                // Índices únicos
                entity.HasIndex(x => x.UsuarioLogin).IsUnique();
                entity.HasIndex(x => x.Cedula).IsUnique();
                entity.HasIndex(x => x.Correo).IsUnique();

                // Relación Usuario → Préstamos
                entity.HasMany(x => x.Prestamos)
                    .WithOne(p => p.Usuario)
                    .HasForeignKey(p => p.UsuarioId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Relación Usuario → Mensajes enviados
                entity.HasMany(x => x.MensajesEnviados)
                    .WithOne(m => m.Remitente)
                    .HasForeignKey(m => m.RemitenteId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Relación Usuario → Mensajes recibidos
                entity.HasMany(x => x.MensajesRecibidos)
                    .WithOne(m => m.Receptor)
                    .HasForeignKey(m => m.ReceptorId)
                    .OnDelete(DeleteBehavior.NoAction);

                // Relación Usuario → Solicitudes
                entity.HasMany(x => x.Solicitudes)
                    .WithOne(s => s.Usuario)
                    .HasForeignKey(s => s.UsuarioId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // =====================================================
            // TABLA: libros
            // =====================================================
            modelBuilder.Entity<Libro>(entity =>
            {
                entity.ToTable("libros");
                entity.HasKey(x => x.Id);

                entity.Property(x => x.Id).HasColumnName("id");
                entity.Property(x => x.Titulo)
                    .IsRequired().HasColumnName("titulo").HasMaxLength(150);
                entity.Property(x => x.Autor)
                    .IsRequired().HasColumnName("autor").HasMaxLength(100);
                entity.Property(x => x.Isbn)
                    .IsRequired().HasColumnName("isbn").HasMaxLength(30);
                entity.Property(x => x.Editorial)
                    .HasColumnName("editorial").HasMaxLength(100);
                entity.Property(x => x.Anio)
                    .HasColumnName("anio");
                entity.Property(x => x.Categoria)
                    .IsRequired().HasColumnName("categoria").HasMaxLength(50);
                entity.Property(x => x.Cantidad)
                    .HasColumnName("cantidad").HasDefaultValue(1);
                entity.Property(x => x.Sinopsis)
                    .HasColumnName("sinopsis");
                entity.Property(x => x.Imagen)
                    .HasColumnName("imagen").HasMaxLength(500)
                    .HasDefaultValue("");
                entity.Property(x => x.ImagenPublicId)
                    .HasColumnName("imagen_public_id").HasMaxLength(255)
                    .HasDefaultValue("");
                entity.Property(x => x.PdfUrl)
                    .HasColumnName("pdf_url").HasMaxLength(500)
                    .HasDefaultValue("");
                entity.Property(x => x.PdfPublicId)
                    .HasColumnName("pdf_public_id").HasMaxLength(255)
                    .HasDefaultValue("");

                // ISBN único
                entity.HasIndex(x => x.Isbn).IsUnique();

                // Relación Libro → Préstamos
                entity.HasMany(x => x.Prestamos)
                    .WithOne(p => p.Libro)
                    .HasForeignKey(p => p.LibroId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // =====================================================
            // TABLA: prestamos
            // =====================================================
            modelBuilder.Entity<Prestamo>(entity =>
            {
                entity.ToTable("prestamos");
                entity.HasKey(x => x.Id);

                entity.Property(x => x.Id).HasColumnName("id");
                entity.Property(x => x.UsuarioId).HasColumnName("usuario_id");
                entity.Property(x => x.LibroId).HasColumnName("libro_id");
                entity.Property(x => x.FechaPrestamo).HasColumnName("fecha_prestamo");
                entity.Property(x => x.FechaDevolucion).HasColumnName("fecha_devolucion");
                entity.Property(x => x.Estado)
                    .IsRequired().HasColumnName("estado").HasMaxLength(20)
                    .HasDefaultValue("Activo");
                entity.Property(x => x.Referencia)
                    .IsRequired().HasColumnName("referencia").HasMaxLength(30);

                entity.HasIndex(x => x.Referencia).IsUnique();
            });

            // =====================================================
            // TABLA: codigos_recuperacion
            // =====================================================
            modelBuilder.Entity<CodigoRecuperacion>(entity =>
            {
                entity.ToTable("codigos_recuperacion");
                entity.HasKey(x => x.Id);

                entity.Property(x => x.Id).HasColumnName("id");
                entity.Property(x => x.UsuarioId).HasColumnName("usuario_id");
                entity.Property(x => x.Codigo)
                    .IsRequired().HasColumnName("codigo").HasMaxLength(20);
                entity.Property(x => x.Expiracion).HasColumnName("expiracion");
                entity.Property(x => x.Usado)
                    .HasColumnName("usado").HasDefaultValue(false);

                entity.HasOne(x => x.Usuario)
                    .WithMany()
                    .HasForeignKey(x => x.UsuarioId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // =====================================================
            // TABLA: mensajes
            // =====================================================
            modelBuilder.Entity<Mensaje>(entity =>
            {
                entity.ToTable("mensajes");
                entity.HasKey(x => x.Id);

                entity.Property(x => x.Id).HasColumnName("id");
                entity.Property(x => x.RemitenteId).HasColumnName("remitente_id");
                entity.Property(x => x.ReceptorId).HasColumnName("receptor_id");
                entity.Property(x => x.Contenido)
                    .IsRequired().HasColumnName("contenido");
                entity.Property(x => x.Leido)
                    .HasColumnName("leido").HasDefaultValue(false);
                entity.Property(x => x.FechaEnvio)
                    .HasColumnName("fecha_envio");

                // Remitente con CASCADE
                entity.HasOne(x => x.Remitente)
                    .WithMany(u => u.MensajesEnviados)
                    .HasForeignKey(x => x.RemitenteId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Receptor con NoAction para evitar múltiples cascade paths
                entity.HasOne(x => x.Receptor)
                    .WithMany(u => u.MensajesRecibidos)
                    .HasForeignKey(x => x.ReceptorId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            // =====================================================
            // TABLA: solicitudes_admin
            // =====================================================
            modelBuilder.Entity<SolicitudAdmin>(entity =>
            {
                entity.ToTable("solicitudes_admin");
                entity.HasKey(x => x.Id);

                entity.Property(x => x.Id).HasColumnName("id");
                entity.Property(x => x.UsuarioId).HasColumnName("usuario_id");
                entity.Property(x => x.Mensaje)
                    .HasColumnName("mensaje").HasMaxLength(500)
                    .HasDefaultValue("");
                entity.Property(x => x.Estado)
                    .IsRequired().HasColumnName("estado").HasMaxLength(20)
                    .HasDefaultValue("Pendiente");
                entity.Property(x => x.FechaSolicitud)
                    .HasColumnName("fecha_solicitud");
                entity.Property(x => x.FechaResolucion)
                    .HasColumnName("fecha_resolucion");

                entity.HasOne(x => x.Usuario)
                    .WithMany(u => u.Solicitudes)
                    .HasForeignKey(x => x.UsuarioId)
                    .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
