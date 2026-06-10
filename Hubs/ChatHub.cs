using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace BiblioSync.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        // Diccionario thread-safe: userId → lista de connectionIds
        // Permite que un usuario tenga múltiples pestañas abiertas
        private static readonly ConcurrentDictionary<int, HashSet<string>> _usuariosConectados
            = new();

        // =====================================================
        // CONEXIÓN
        // Al conectar, el usuario se une a su grupo personal
        // "usuario_{id}" para recibir notificaciones dirigidas
        // =====================================================
        public override async Task OnConnectedAsync()
        {
            var idClaim = Context.User?.FindFirst("id")?.Value;
            if (int.TryParse(idClaim, out int userId))
            {
                var grupoPersonal = $"usuario_{userId}";
                await Groups.AddToGroupAsync(Context.ConnectionId, grupoPersonal);

                // Registrar conexión en el diccionario
                _usuariosConectados.AddOrUpdate(
                    userId,
                    _ => new HashSet<string> { Context.ConnectionId },
                    (_, set) => { lock (set) { set.Add(Context.ConnectionId); } return set; }
                );
            }

            // Notificar a todos que este usuario se conectó
            await Clients.Others.SendAsync("UsuarioConectado", userId);

            await base.OnConnectedAsync();
        }

        // =====================================================
        // DESCONEXIÓN
        // Limpia el connectionId del diccionario
        // =====================================================
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var idClaim = Context.User?.FindFirst("id")?.Value;
            if (int.TryParse(idClaim, out int userId))
            {
                if (_usuariosConectados.TryGetValue(userId, out var conexiones))
                {
                    lock (conexiones)
                    {
                        conexiones.Remove(Context.ConnectionId);
                    }

                    // Si no quedan conexiones, remover del diccionario
                    if (conexiones.Count == 0)
                        _usuariosConectados.TryRemove(userId, out _);
                }

                var grupoPersonal = $"usuario_{userId}";
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, grupoPersonal);
            }

            // Notificar a todos que este usuario se desconectó (solo si no quedan conexiones)
            if (!_usuariosConectados.ContainsKey(userId))
                await Clients.Others.SendAsync("UsuarioDesconectado", userId);

            await base.OnDisconnectedAsync(exception);
        }

        // =====================================================
        // UNIRSE A UNA CONVERSACIÓN
        // El cliente llama a esto al abrir el chat con alguien
        // Ambos se unen al grupo de la conversación
        // =====================================================
        public async Task UnirseConversacion(int otroUsuarioId)
        {
            var idClaim = Context.User?.FindFirst("id")?.Value;
            if (!int.TryParse(idClaim, out int miId)) return;

            // El grupo de conversación usa IDs ordenados para ser consistente
            var grupoConversacion = ObtenerGrupoConversacion(miId, otroUsuarioId);
            await Groups.AddToGroupAsync(Context.ConnectionId, grupoConversacion);
        }

        // =====================================================
        // SALIR DE UNA CONVERSACIÓN
        // El cliente llama a esto al cerrar el chat
        // =====================================================
        public async Task SalirConversacion(int otroUsuarioId)
        {
            var idClaim = Context.User?.FindFirst("id")?.Value;
            if (!int.TryParse(idClaim, out int miId)) return;

            var grupoConversacion = ObtenerGrupoConversacion(miId, otroUsuarioId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, grupoConversacion);
        }

        // =====================================================
        // INDICADOR DE ESCRITURA
        // El cliente llama a esto mientras escribe
        // El receptor ve "Usuario está escribiendo..."
        // =====================================================
        public async Task Escribiendo(int receptorId, string nombreRemitente)
        {
            var idClaim = Context.User?.FindFirst("id")?.Value;
            if (!int.TryParse(idClaim, out int miId)) return;

            var grupoConversacion = ObtenerGrupoConversacion(miId, receptorId);

            // Notificar al receptor — excluir al propio remitente
            await Clients.GroupExcept(grupoConversacion, Context.ConnectionId)
                .SendAsync("UsuarioEscribiendo", new
                {
                    usuarioId = miId,
                    nombre    = nombreRemitente
                });
        }

        // =====================================================
        // DEJÓ DE ESCRIBIR
        // Se llama cuando el usuario para de escribir
        // o envía el mensaje
        // =====================================================
        public async Task DejoDeEscribir(int receptorId)
        {
            var idClaim = Context.User?.FindFirst("id")?.Value;
            if (!int.TryParse(idClaim, out int miId)) return;

            var grupoConversacion = ObtenerGrupoConversacion(miId, receptorId);

            await Clients.GroupExcept(grupoConversacion, Context.ConnectionId)
                .SendAsync("UsuarioDejoDeEscribir", new { usuarioId = miId });
        }

        // =====================================================
        // CONSULTAR USUARIOS CONECTADOS
        // Devuelve lista de IDs de usuarios actualmente online
        // =====================================================
        public Task<List<int>> ObtenerConectados()
        {
            return Task.FromResult(_usuariosConectados.Keys.ToList());
        }

        // =====================================================
        // HELPER — Nombre de grupo de conversación consistente
        // Siempre menor_id-mayor_id para que ambos usuarios
        // compartan el mismo grupo independientemente del orden
        // =====================================================
        private static string ObtenerGrupoConversacion(int idA, int idB)
        {
            var menor = Math.Min(idA, idB);
            var mayor = Math.Max(idA, idB);
            return $"conv_{menor}_{mayor}";
        }
    }
}
