using CloudinaryDotNet;
using CloudinaryDotNet.Actions;

namespace BiblioSync.Services
{
    public class CloudinaryService
    {
        private readonly Cloudinary _cloudinary;

        public CloudinaryService(IConfiguration config)
        {
            var cloudName = config["Cloudinary:CloudName"]!;
            var apiKey    = config["Cloudinary:ApiKey"]!;
            var apiSecret = config["Cloudinary:ApiSecret"]!;

            var account   = new Account(cloudName, apiKey, apiSecret);
            _cloudinary   = new Cloudinary(account);
            _cloudinary.Api.Secure  = true;
            // Timeout en milisegundos — 0 = infinito en CloudinaryDotNet
            _cloudinary.Api.Timeout = 0;
        }

        // =====================================================
        // SUBIR IMAGEN (foto de perfil o portada de libro)
        // Retorna: (url, publicId) o lanza excepción
        // =====================================================
        public async Task<(string Url, string PublicId)> SubirImagenAsync(
            IFormFile archivo,
            string carpeta)
        {
            if (archivo == null || archivo.Length == 0)
                throw new ArgumentException("El archivo de imagen está vacío.");

            var extensionesPermitidas = new[] { ".jpg", ".jpeg", ".png", ".webp" };
            var extension = Path.GetExtension(archivo.FileName).ToLower();
            if (!extensionesPermitidas.Contains(extension))
                throw new ArgumentException("Solo se permiten imágenes JPG, PNG o WebP.");

            // Límite de 5 MB para imágenes
            if (archivo.Length > 5 * 1024 * 1024)
                throw new ArgumentException("La imagen no puede superar los 5 MB.");

            using var stream = archivo.OpenReadStream();

            var uploadParams = new ImageUploadParams
            {
                File           = new FileDescription(archivo.FileName, stream),
                Folder         = $"bibliosync/{carpeta}",
                Transformation = new Transformation()
                    .Quality("auto")
                    .FetchFormat("auto"),
                Overwrite      = true
            };

            var resultado = await _cloudinary.UploadAsync(uploadParams);

            if (resultado.Error != null)
                throw new Exception($"Error Cloudinary: {resultado.Error.Message}");

            return (resultado.SecureUrl.ToString(), resultado.PublicId);
        }

        // =====================================================
        // SUBIR PDF (archivo de libro)
        // Retorna: (url, publicId) o lanza excepción
        // =====================================================
        public async Task<(string Url, string PublicId)> SubirPdfAsync(
            IFormFile archivo,
            string carpeta)
        {
            if (archivo == null || archivo.Length == 0)
                throw new ArgumentException("El archivo PDF está vacío.");

            var extension = Path.GetExtension(archivo.FileName).ToLower();
            if (extension != ".pdf")
                throw new ArgumentException("Solo se permiten archivos PDF.");

            if (archivo.Length > 50 * 1024 * 1024)
                throw new ArgumentException("El PDF no puede superar los 50 MB.");

            // Sanitizar nombre
            var nombreLimpio = Path.GetFileNameWithoutExtension(archivo.FileName);
            nombreLimpio = nombreLimpio.Normalize(System.Text.NormalizationForm.FormD);
            nombreLimpio = new string(nombreLimpio
                .Where(c => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
                    != System.Globalization.UnicodeCategory.NonSpacingMark)
                .ToArray());
            nombreLimpio = System.Text.RegularExpressions.Regex.Replace(nombreLimpio, @"[^a-zA-Z0-9_-]", "_");
            nombreLimpio = nombreLimpio.Trim('_');

            using var stream = archivo.OpenReadStream();

            var uploadParams = new RawUploadParams
            {
                File           = new FileDescription(archivo.FileName, stream),
                Folder         = $"bibliosync/{carpeta}",
                PublicId       = nombreLimpio,
                Overwrite      = true,
                UseFilename    = false,
                UniqueFilename = false,
                AccessMode     = "public"
            };

            var resultado = await _cloudinary.UploadAsync(uploadParams);

            if (resultado.Error != null)
                throw new Exception($"Error Cloudinary: {resultado.Error.Message}");

            return (resultado.SecureUrl.ToString(), resultado.PublicId);
        }

        // =====================================================
        // ELIMINAR RECURSO (imagen o PDF)
        // Se llama al eliminar libro o cambiar foto de perfil
        // =====================================================
        public async Task<bool> EliminarAsync(string publicId, bool esPdf = false)
        {
            if (string.IsNullOrWhiteSpace(publicId)) return false;

            DeletionParams deleteParams;

            if (esPdf)
            {
                deleteParams = new DeletionParams(publicId)
                {
                    ResourceType = ResourceType.Raw
                };
            }
            else
            {
                deleteParams = new DeletionParams(publicId)
                {
                    ResourceType = ResourceType.Image
                };
            }

            var resultado = await _cloudinary.DestroyAsync(deleteParams);
            return resultado.Result == "ok";
        }

        // =====================================================
        // SUBIR FOTO DE PERFIL
        // Wrapper con carpeta fija y transformación circular
        // =====================================================
        public async Task<(string Url, string PublicId)> SubirFotoPerfilAsync(IFormFile archivo)
        {
            if (archivo == null || archivo.Length == 0)
                throw new ArgumentException("El archivo de foto está vacío.");

            var extensionesPermitidas = new[] { ".jpg", ".jpeg", ".png", ".webp" };
            var extension = Path.GetExtension(archivo.FileName).ToLower();
            if (!extensionesPermitidas.Contains(extension))
                throw new ArgumentException("Solo se permiten imágenes JPG, PNG o WebP.");

            // Límite de 2 MB para fotos de perfil
            if (archivo.Length > 2 * 1024 * 1024)
                throw new ArgumentException("La foto de perfil no puede superar los 2 MB.");

            using var stream = archivo.OpenReadStream();

            var uploadParams = new ImageUploadParams
            {
                File           = new FileDescription(archivo.FileName, stream),
                Folder         = "bibliosync/perfiles",
                // Recorte cuadrado centrado 400x400
                Transformation = new Transformation()
                    .Width(400).Height(400)
                    .Crop("fill").Gravity("face")
                    .Quality("auto").FetchFormat("auto"),
                Overwrite      = true
            };

            var resultado = await _cloudinary.UploadAsync(uploadParams);

            if (resultado.Error != null)
                throw new Exception($"Error Cloudinary: {resultado.Error.Message}");

            return (resultado.SecureUrl.ToString(), resultado.PublicId);
        }
    }
}
