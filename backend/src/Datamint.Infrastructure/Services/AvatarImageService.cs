using Datamint.Application.Interfaces;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Datamint.Infrastructure.Services;

public class AvatarImageService : IAvatarImageService
{
    private const int MaxDimension = 512;

    public async Task<ProcessedAvatarImage> ProcessAsync(Stream input, CancellationToken ct = default)
    {
        Image<Rgba32> image;
        try
        {
            // This is the actual validation step: ImageSharp only succeeds here for bytes
            // that decode as a real, well-formed image (JPEG/PNG/WebP/GIF/BMP) - a renamed
            // .exe, an SVG with an embedded <script>, or a truncated/corrupt file all throw
            // here rather than getting stored and later served back to someone's browser.
            image = await Image.LoadAsync<Rgba32>(input, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new InvalidOperationException("That file isn't a valid image (JPEG, PNG, WebP, GIF, or BMP).");
        }

        using (image)
        {
            // Square crop-to-fill + downscale: keeps every avatar a predictable size
            // regardless of what was uploaded, so no oversized or oddly-shaped image can
            // bloat storage or break the circular avatar UI it's displayed in.
            image.Mutate(ctx => ctx.Resize(new ResizeOptions
            {
                Mode = ResizeMode.Crop,
                Size = new SixLabors.ImageSharp.Size(MaxDimension, MaxDimension)
            }));

            using var output = new MemoryStream();
            await image.SaveAsync(output, new JpegEncoder { Quality = 85 }, ct);
            return new ProcessedAvatarImage(output.ToArray(), ".jpg", "image/jpeg");
        }
    }
}
