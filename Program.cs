using System.Text;
using System.Text.Json;
using BiblioSync.Data;
using BiblioSync.Hubs;
using BiblioSync.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// =====================================================
// CONEXIÓN MYSQL
// =====================================================
var connectionString = builder.Configuration
    .GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySql(
        connectionString,
        ServerVersion.AutoDetect(connectionString)
    )
);

// =====================================================
// CLOUDINARY — servicio inyectable
// =====================================================
builder.Services.AddSingleton<CloudinaryService>();

// =====================================================
// SANCIÓN AUTOMÁTICA — background service
// Corre cada hora: marca préstamos vencidos y sanciona
// usuarios. Reactiva automáticamente al devolver.
// =====================================================
builder.Services.AddHostedService<BiblioSync.Services.SancionAutomaticaService>();

// =====================================================
// AUTENTICACIÓN JWT
// El token se acepta también desde query string
// para que SignalR pueda autenticarse
// =====================================================
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("JWT Secret no configurado.");

var keyBytes = Encoding.UTF8.GetBytes(jwtSecret);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(keyBytes),
            ValidateIssuer           = false,
            ValidateAudience         = false,
            ClockSkew                = TimeSpan.Zero
        };

        // SignalR envía el token por query string (?access_token=...)
        // porque WebSockets no soporta headers HTTP estándar
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path        = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken) &&
                    path.StartsWithSegments("/hubs/chat"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// =====================================================
// SIGNALR — mensajería en tiempo real
// =====================================================
builder.Services.AddSignalR(options =>
{
    // Tamaño máximo de mensaje SignalR: 64 KB
    options.MaximumReceiveMessageSize = 64 * 1024;
});

// =====================================================
// CONTROLADORES + CAMELCASE JSON
// =====================================================
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    });

// =====================================================
// LÍMITE DE TAMAÑO DE ARCHIVOS
// Necesario para subir PDFs de hasta 50 MB
// =====================================================
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit  = 52_428_800; // 50 MB
    options.ValueLengthLimit          = int.MaxValue;
    options.MultipartHeadersLengthLimit = int.MaxValue;
});

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize    = 52_428_800; // 50 MB
    options.Limits.KeepAliveTimeout      = TimeSpan.FromMinutes(10);
    options.Limits.RequestHeadersTimeout = TimeSpan.FromMinutes(10);
    options.Limits.MinRequestBodyDataRate = null; // Sin límite de velocidad mínima
    options.Limits.MinResponseDataRate    = null;
});

// =====================================================
// CORS
// =====================================================
var esDesarrollo = builder.Environment.IsDevelopment();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Desarrollo", policy =>
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod());

    // SignalR en producción requiere AllowCredentials + origen específico
    options.AddPolicy("Produccion", policy =>
        policy.WithOrigins("https://tudominio.edu.co")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

var app = builder.Build();

// =====================================================
// PIPELINE HTTP
// UseStaticFiles ANTES de UseAuthorization
// para que la SPA cargue sin token
// =====================================================
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();

app.UseCors(esDesarrollo ? "Desarrollo" : "Produccion");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// =====================================================
// SIGNALR HUB — endpoint WebSocket
// =====================================================
app.MapHub<ChatHub>("/hubs/chat");

app.Run();
