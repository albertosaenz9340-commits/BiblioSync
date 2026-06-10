using BiblioSync.Data;
using Microsoft.AspNetCore.SignalR;
using BiblioSync.Hubs;
using Microsoft.EntityFrameworkCore;

namespace BiblioSync.Services
{
    public class SancionAutomaticaService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<SancionAutomaticaService> _logger;
        private readonly IHubContext<ChatHub> _hubContext;

        // Intervalo de verificación: cada hora
        private readonly TimeSpan _intervalo = TimeSpan.FromHours(1);

        public SancionAutomaticaService(
            IServiceProvider serviceProvider,
            ILogger<SancionAutomaticaService> logger,
            IHubContext<ChatHub> hubContext)
        {
            _serviceProvider = serviceProvider;
            _logger          = logger;
            _hubContext      = hubContext;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Servicio de sanción automática iniciado.");

            // Ejecutar inmediatamente al arrancar
            await ProcesarSanciones();

            // Luego cada hora
            using var timer = new PeriodicTimer(_intervalo);
            while (!stoppingToken.IsCancellationRequested &&
                   await timer.WaitForNextTickAsync(stoppingToken))
            {
                await ProcesarSanciones();
            }
        }

        private async Task ProcesarSanciones()
        {
            try
            {
                using var scope   = _serviceProvider.CreateScope();
                var context       = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var ahora         = DateTime.UtcNow;

                // 1. Marcar préstamos vencidos que siguen como 'Activo'
                var prestamosVencidos = await context.Prestamos
                    .Where(p => p.Estado == "Activo" && p.FechaDevolucion < ahora)
                    .ToListAsync();

                if (prestamosVencidos.Any())
                {
                    foreach (var p in prestamosVencidos)
                        p.Estado = "Vencido";

                    await context.SaveChangesAsync();
                    _logger.LogInformation(
                        "{Count} préstamo(s) marcados como Vencidos.", prestamosVencidos.Count);
                }

                // 2. Sancionar usuarios con préstamos vencidos que estén 'Activo'
                var idsConVencidos = await context.Prestamos
                    .Where(p => p.Estado == "Vencido")
                    .Select(p => p.UsuarioId)
                    .Distinct()
                    .ToListAsync();

                if (idsConVencidos.Any())
                {
                    var usuariosASancionar = await context.Usuarios
                        .Where(u =>
                            idsConVencidos.Contains(u.Id) &&
                            u.Estado    == "Activo"       &&
                            u.TipoRol   != "Administrador")
                        .ToListAsync();

                    if (usuariosASancionar.Any())
                    {
                        foreach (var u in usuariosASancionar)
                            u.Estado = "Sancionado";

                        await context.SaveChangesAsync();
                        _logger.LogInformation(
                            "{Count} usuario(s) sancionados automáticamente.", usuariosASancionar.Count);
                    }
                }

                // 3. Notificar préstamos próximos a vencer (entre 12 y 24 horas)
                var en24horas = ahora.AddHours(24);
                var en12horas = ahora.AddHours(12);

                var proximosAVencer = await context.Prestamos
                    .Include(p => p.Libro)
                    .Where(p =>
                        p.Estado         == "Activo"  &&
                        p.FechaDevolucion <= en24horas &&
                        p.FechaDevolucion >  ahora)
                    .ToListAsync();

                foreach (var prestamo in proximosAVencer)
                {
                    var horasRestantes = (prestamo.FechaDevolucion - ahora).TotalHours;
                    var titulo  = prestamo.Libro?.Titulo ?? "el libro";
                    var mensaje = horasRestantes <= 12
                        ? $"⚠️ Tu préstamo de '{titulo}' vence en menos de 12 horas."
                        : $"⏰ Tu préstamo de '{titulo}' vence en menos de 24 horas.";

                    await _hubContext.Clients
                        .Group($"usuario_{prestamo.UsuarioId}")
                        .SendAsync("NotificacionPrestamo", new
                        {
                            tipo       = horasRestantes <= 12 ? "urgente" : "aviso",
                            mensaje,
                            prestamoId = prestamo.Id,
                            titulo     = prestamo.Libro?.Titulo,
                            fecha      = prestamo.FechaDevolucion
                        });
                }

                // 4. Reactivar usuarios sancionados que ya devolvieron todos sus préstamos vencidos
                var usuariosSancionados = await context.Usuarios
                    .Where(u => u.Estado == "Sancionado")
                    .ToListAsync();

                foreach (var u in usuariosSancionados)
                {
                    var tieneVencidos = await context.Prestamos
                        .AnyAsync(p => p.UsuarioId == u.Id && p.Estado == "Vencido");

                    if (!tieneVencidos)
                    {
                        u.Estado = "Activo";
                        _logger.LogInformation(
                            "Usuario {Nombre} reactivado automáticamente.", u.Nombre);
                    }
                }

                await context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en el servicio de sanción automática.");
            }
        }
    }
}
